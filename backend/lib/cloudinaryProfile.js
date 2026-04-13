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
  if (process.env.CLOUDINARY_URL) {
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

module.exports = { cloudinary, isConfigured, uploadProfileImage };
