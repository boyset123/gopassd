const { cloudinary, isConfigured, applyConfig } = require('./cloudinaryProfile');

/**
 * @param {string} mimeType
 * @returns {'image' | 'raw'}
 */
function resourceTypeForMime(mimeType) {
  const mt = (mimeType || '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  return 'raw';
}

/**
 * Upload a travel-order supporting file to Cloudinary.
 *
 * @param {Buffer} buffer
 * @param {{ orderId: string; fileIndex: number; mimeType: string; originalName?: string }} opts
 * @returns {Promise<{ publicId: string; resourceType: 'image' | 'raw'; format?: string }>}
 */
function uploadTravelOrderAttachment(buffer, opts) {
  if (!isConfigured()) {
    return Promise.reject(new Error('Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, API_KEY, and API_SECRET.'));
  }
  applyConfig();

  const { orderId, fileIndex, mimeType, originalName } = opts;
  const resourceType = resourceTypeForMime(mimeType);
  const safeBase = String(originalName || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 80);
  const publicId = `${fileIndex}-${Date.now()}-${safeBase}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `gopass/travel-orders/${orderId}`,
        public_id: publicId,
        resource_type: resourceType,
        use_filename: false,
        unique_filename: true,
      },
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        if (!result?.public_id) {
          reject(new Error('Cloudinary upload returned no public_id'));
          return;
        }
        resolve({
          publicId: result.public_id,
          resourceType,
          format: result.format || undefined,
        });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Primary then alternate Cloudinary resource_type (handles bad or missing `resourceType` on old rows).
 *
 * @param {{ resourceType?: string; contentType?: string }} doc
 * @returns {('image' | 'raw')[]}
 */
function resourceTypesToTry(doc) {
  const primary =
    doc.resourceType === 'image' || doc.resourceType === 'raw'
      ? doc.resourceType
      : resourceTypeForMime(doc.contentType);
  const secondary = primary === 'image' ? 'raw' : 'image';
  if (primary === secondary) return [primary];
  return [primary, secondary];
}

/**
 * @param {string} publicId
 * @param {'image' | 'raw'} resourceType
 * @returns {Promise<object | null>}
 */
function adminResourceByType(publicId, resourceType) {
  applyConfig();
  const id = String(publicId || '').trim();
  if (!id) return Promise.resolve(null);
  return new Promise((resolve) => {
    cloudinary.api.resource(id, { resource_type: resourceType }, (err, result) => {
      if (err || !result?.public_id) {
        resolve(null);
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Build delivery URLs from Admin `resource` metadata (includes `version`; critical for `raw`/PDF).
 *
 * @param {{ public_id: string; resource_type?: string; version?: string | number; format?: string; secure_url?: string; url?: string }} result
 * @returns {string[]}
 */
function deliveryUrlsFromAdminResult(result) {
  if (!result?.public_id) return [];
  applyConfig();
  const rt =
    result.resource_type === 'image' || result.resource_type === 'raw' ? result.resource_type : 'raw';
  const id = result.public_id;
  const version = result.version;
  const fmt = result.format ? String(result.format).replace(/^\./, '') : undefined;

  const urls = [];
  const add = (u) => {
    if (typeof u !== 'string' || !u) return;
    const normalized = u.replace(/^http:\/\//i, 'https://');
    if (!urls.includes(normalized)) urls.push(normalized);
  };

  if (result.secure_url) add(result.secure_url);
  if (result.url) add(result.url);

  /** @type {Record<string, unknown>[]} */
  const extraVariants = [];
  const pushVariant = (v) => {
    const key = JSON.stringify(v);
    if (!extraVariants.some((x) => JSON.stringify(x) === key)) extraVariants.push(v);
  };
  if (rt === 'raw') {
    if (fmt) pushVariant({ format: fmt });
    pushVariant({});
  } else {
    pushVariant({});
    if (fmt) pushVariant({ format: fmt });
  }

  for (const extra of extraVariants) {
    for (const signUrl of [true, false]) {
      /** @type {Record<string, unknown>} */
      const opts = {
        resource_type: rt,
        secure: true,
        sign_url: signUrl,
        ...extra,
      };
      if (version != null && version !== '') opts.version = version;
      add(cloudinary.url(id, opts));
    }
  }

  return urls;
}

/**
 * Admin API: ordered delivery URLs (version + format aware). Tries resource_type candidates until
 * one `resource` call succeeds (wrong type yields null).
 *
 * @param {string} publicId
 * @param {('image' | 'raw')[]} resourceTypesInOrder
 * @returns {Promise<string[]>}
 */
async function adminDeliveryUrlsToTry(publicId, resourceTypesInOrder) {
  const id = String(publicId || '').trim();
  if (!id) return [];
  const types =
    Array.isArray(resourceTypesInOrder) && resourceTypesInOrder.length > 0
      ? [...new Set(resourceTypesInOrder)]
      : ['image', 'raw'];

  const out = [];
  const seen = new Set();
  for (const rt of types) {
    const result = await adminResourceByType(id, rt);
    if (!result) continue;
    for (const u of deliveryUrlsFromAdminResult(result)) {
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
    break;
  }
  return out;
}

/**
 * Admin API: first canonical HTTPS delivery URL (legacy helper).
 *
 * @param {string} publicId
 * @param {('image' | 'raw')[]} resourceTypesInOrder
 * @returns {Promise<string | null>}
 */
async function resourceSecureUrlFromAdmin(publicId, resourceTypesInOrder) {
  const list = await adminDeliveryUrlsToTry(publicId, resourceTypesInOrder);
  return list[0] || null;
}

/**
 * Guess Cloudinary `format` option for raw uploads from filename (public_id may omit extension).
 *
 * @param {string | undefined} name
 * @returns {string | undefined}
 */
function inferRawFormatFromFilename(name) {
  const n = String(name || '').toLowerCase();
  const m = n.match(/\.([a-z0-9]+)$/i);
  if (!m) return undefined;
  const ext = m[1];
  if (ext === 'jpeg') return 'jpg';
  if (['pdf', 'png', 'gif', 'webp', 'jpg', 'docx'].includes(ext)) return ext;
  return undefined;
}

/**
 * Delivery URLs to try when fetching an asset from Cloudinary (server-side only).
 * Raw files (PDF, DOCX) often need an explicit `format` in `cloudinary.url()`; without it,
 * generated URLs 404/401 while images still work.
 *
 * @param {string} publicId
 * @param {'image' | 'raw'} resourceType
 * @param {{ format?: string; name?: string }} [meta]
 * @returns {string[]}
 */
function assetDeliveryUrlsToTry(publicId, resourceType, meta = {}) {
  applyConfig();
  const id = String(publicId || '').trim();
  const formatHint = meta.format ? String(meta.format).replace(/^\./, '') : undefined;
  const fromName = inferRawFormatFromFilename(meta.name);

  /** @type {Record<string, unknown>[]} */
  const extraVariants = [];
  const pushVariant = (v) => {
    const key = JSON.stringify(v);
    if (!extraVariants.some((x) => JSON.stringify(x) === key)) extraVariants.push(v);
  };

  if (resourceType === 'raw') {
    pushVariant({});
    if (formatHint) pushVariant({ format: formatHint });
    if (fromName && fromName !== formatHint) pushVariant({ format: fromName });
  } else {
    pushVariant({});
  }

  const urls = [];
  const seen = new Set();
  for (const extra of extraVariants) {
    for (const signUrl of [true, false]) {
      const u = cloudinary.url(id, {
        resource_type: resourceType,
        secure: true,
        sign_url: signUrl,
        ...extra,
      });
      if (!seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
    }
  }
  return urls;
}

/**
 * @deprecated Prefer assetDeliveryUrlsToTry; kept for callers that need a single URL.
 */
function assetDeliveryUrl(publicId, resourceType, meta = {}) {
  return assetDeliveryUrlsToTry(publicId, resourceType, meta)[0];
}

/**
 * @deprecated Use assetDeliveryUrl; kept as alias for callers.
 */
function signedDeliveryUrl(publicId, resourceType, _ttlSec = 600, meta = {}) {
  return assetDeliveryUrl(publicId, resourceType, meta);
}

/**
 * Best-effort delete (e.g. rollback after a failed multi-file upload).
 *
 * @param {string} publicId
 * @param {'image' | 'raw'} resourceType
 */
function destroyTravelOrderUpload(publicId, resourceType) {
  if (!publicId || !isConfigured()) return Promise.resolve();
  applyConfig();
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, { resource_type: resourceType }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

module.exports = {
  isConfigured,
  resourceTypeForMime,
  resourceTypesToTry,
  uploadTravelOrderAttachment,
  assetDeliveryUrl,
  assetDeliveryUrlsToTry,
  adminDeliveryUrlsToTry,
  resourceSecureUrlFromAdmin,
  signedDeliveryUrl,
  destroyTravelOrderUpload,
};
