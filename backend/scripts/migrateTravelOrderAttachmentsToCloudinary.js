/**
 * One-off migration: travel order supporting files stored as MongoDB Buffers
 * -> Cloudinary (metadata only on the TravelOrder document).
 *
 * Prerequisites: CLOUDINARY_* or CLOUDINARY_URL, MONGODB_URI in .env (same as server).
 *
 * Usage (from repo root):
 *   node backend/scripts/migrateTravelOrderAttachmentsToCloudinary.js
 *   node backend/scripts/migrateTravelOrderAttachmentsToCloudinary.js --dry-run
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const TravelOrder = require('../models/TravelOrder');
const {
  isConfigured,
  uploadTravelOrderAttachment,
  destroyTravelOrderUpload,
} = require('../lib/cloudinaryTravelOrder');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gopassdorsu';
const dryRun = process.argv.includes('--dry-run');

function nonEmptyBuffer(buf) {
  if (buf == null) return false;
  if (Buffer.isBuffer(buf)) return buf.length > 0;
  if (typeof buf === 'object' && buf.type === 'Buffer' && Array.isArray(buf.data)) return buf.data.length > 0;
  if (typeof buf === 'object' && Array.isArray(buf.data)) return buf.data.length > 0;
  return false;
}

function toBuffer(buf) {
  if (Buffer.isBuffer(buf)) return buf;
  if (buf && Array.isArray(buf.data)) return Buffer.from(buf.data);
  return Buffer.alloc(0);
}

async function migrate() {
  if (!isConfigured()) {
    console.error('Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_* env vars.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('MongoDB connected');

  const query = {
    $or: [{ 'documents.data': { $exists: true } }, { 'document.data': { $exists: true } }],
  };

  const cursor = TravelOrder.find(query).cursor();
  let examined = 0;
  let migratedOrders = 0;
  let migratedFiles = 0;
  let skippedOrders = 0;

  for await (const order of cursor) {
    examined += 1;
    const oid = order._id.toString();
    let orderChanged = false;
    const rollbackDestroy = [];

    try {
      if (Array.isArray(order.documents) && order.documents.length > 0) {
        const nextDocs = [];
        for (let i = 0; i < order.documents.length; i++) {
          const sub = order.documents[i];
          if (!sub) {
            nextDocs.push(sub);
            continue;
          }
          if (nonEmptyBuffer(sub.data)) {
            const buffer = toBuffer(sub.data);
            const mime = sub.contentType || 'application/octet-stream';
            if (dryRun) {
              console.log(`[dry-run] would upload documents[${i}] for order ${oid} (${mime}, ${buffer.length} bytes)`);
              migratedFiles += 1;
            } else {
              const uploaded = await uploadTravelOrderAttachment(buffer, {
                orderId: oid,
                fileIndex: i,
                mimeType: mime,
                originalName: sub.name,
              });
              rollbackDestroy.push({ publicId: uploaded.publicId, resourceType: uploaded.resourceType });
              nextDocs.push({
                publicId: uploaded.publicId,
                resourceType: uploaded.resourceType,
                format: uploaded.format,
                contentType: mime,
                name: sub.name || `attachment-${i + 1}`,
              });
              migratedFiles += 1;
            }
            orderChanged = true;
          } else {
            nextDocs.push({
              publicId: sub.publicId,
              resourceType: sub.resourceType,
              format: sub.format,
              contentType: sub.contentType,
              name: sub.name,
            });
          }
        }
        if (orderChanged) {
          if (!dryRun) {
            order.documents = nextDocs;
            order.markModified('documents');
          }
        }
      } else if (order.document && nonEmptyBuffer(order.document.data)) {
        const buffer = toBuffer(order.document.data);
        const mime = order.document.contentType || 'application/octet-stream';
        if (dryRun) {
          console.log(`[dry-run] would upload legacy document for order ${oid} (${mime}, ${buffer.length} bytes)`);
          migratedFiles += 1;
        } else {
          const uploaded = await uploadTravelOrderAttachment(buffer, {
            orderId: oid,
            fileIndex: 0,
            mimeType: mime,
            originalName: order.document.name,
          });
          rollbackDestroy.push({ publicId: uploaded.publicId, resourceType: uploaded.resourceType });
          order.document = {
            publicId: uploaded.publicId,
            resourceType: uploaded.resourceType,
            format: uploaded.format,
            contentType: mime,
            name: order.document.name || 'attachment',
          };
          migratedFiles += 1;
        }
        orderChanged = true;
      }

      if (!orderChanged) {
        skippedOrders += 1;
        continue;
      }

      if (dryRun) {
        migratedOrders += 1;
        continue;
      }

      await order.save();
      migratedOrders += 1;
      console.log(`Migrated attachments for travel order ${oid} (${migratedFiles} total files so far)`);
    } catch (err) {
      console.error(`Failed migrating order ${oid}:`, err.message || err);
      for (const d of rollbackDestroy) {
        try {
          await destroyTravelOrderUpload(d.publicId, d.resourceType);
        } catch (e) {
          console.warn('Rollback destroy failed:', e?.message || e);
        }
      }
    }
  }

  console.log('--- done ---');
  console.log(`Examined (matched query): ${examined}`);
  console.log(`Migrated orders: ${migratedOrders}`);
  console.log(`Migrated files: ${migratedFiles}`);
  console.log(`Skipped (no non-empty buffer in matched docs): ${skippedOrders}`);
  if (dryRun) {
    console.log(
      'Dry run only: no database writes and no Cloudinary uploads. The "migrated files" count above is how many buffers would be uploaded.'
    );
  }
}

migrate()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
