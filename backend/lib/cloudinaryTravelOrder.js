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
 * Admin API: resolve canonical delivery URL (includes version segment). Tries resource_type
 * candidates in order (wrong type returns 404 from Admin API).
 *
 * @param {string} publicId
 * @param {('image' | 'raw')[]} resourceTypesInOrder
 * @returns {Promise<string | null>}
 */
function resourceSecureUrlFromAdmin(publicId, resourceTypesInOrder) {
  applyConfig();
  const id = String(publicId || '').trim();
  if (!id) return Promise.resolve(null);
  const types =
    Array.isArray(resourceTypesInOrder) && resourceTypesInOrder.length > 0
      ? [...new Set(resourceTypesInOrder)]
      : ['image', 'raw'];

  return new Promise((resolve) => {
    let i = 0;
    function tryNext() {
      if (i >= types.length) {
        resolve(null);
        return;
      }
      const rt = types[i++];
      cloudinary.api.resource(id, { resource_type: rt }, (err, result) => {
        if (!err && result && (result.secure_url || result.url)) {
          const u = result.secure_url || result.url;
          resolve(typeof u === 'string' ? u.replace(/^http:\/\//i, 'https://') : null);
          return;
        }
        tryNext();
      });
    }
    tryNext();
  });
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
  resourceSecureUrlFromAdmin,
  signedDeliveryUrl,
  destroyTravelOrderUpload,
};
