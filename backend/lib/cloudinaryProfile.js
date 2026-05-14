const cloudinary = require('cloudinary').v2;

function isConfigured() {
  if (process.env.CLOUDINARY_URL) {
    return true;
  }
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function applyConfig() {
  const conn = process.env.CLOUDINARY_URL;
  if (conn && String(conn).trim().startsWith('cloudinary://')) {
    const withoutScheme = String(conn).trim().replace(/^cloudinary:\/\//, '');
    const atIdx = withoutScheme.lastIndexOf('@');
    if (atIdx > 0) {
      const cloudName = withoutScheme.slice(atIdx + 1).split('?')[0];
      const pair = withoutScheme.slice(0, atIdx);
      const colonIdx = pair.indexOf(':');
      const apiKey = colonIdx >= 0 ? pair.slice(0, colonIdx) : pair;
      const apiSecret = colonIdx >= 0 ? pair.slice(colonIdx + 1) : '';
      if (cloudName && apiKey && apiSecret) {
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
          secure: true,
        });
        return;
      }
    }
  }
  if (conn && String(conn).trim()) {
    try {
      cloudinary.config(String(conn).trim());
    } catch (e) {
      console.warn('CLOUDINARY_URL cloudinary.config failed:', e?.message || e);
    }
    return;
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * @param {Buffer} buffer
 * @param {string} userId
 * @returns {Promise<{ secure_url: string }>}
 */
function uploadProfileImage(buffer, userId) {
  applyConfig();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'gopass/profile-pictures',
        public_id: `${userId}-${Date.now()}`,
        resource_type: 'image',
      },
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        if (!result?.secure_url) {
          reject(new Error('Cloudinary upload returned no URL'));
          return;
        }
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { cloudinary, isConfigured, applyConfig, uploadProfileImage };
