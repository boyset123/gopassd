/**
 * Strip binary from travel order `document` / `documents` before JSON serialization.
 * Normalizes API to `documents: [{ name, contentType }]` (legacy single `document` when no array).
 */
function travelOrderToClientJson(doc) {
  if (doc == null) return doc;
  const o =
    typeof doc.toObject === 'function'
      ? doc.toObject({ flattenMaps: true })
      : typeof doc === 'object'
        ? { ...doc }
        : doc;

  const metaList = [];

  const hasBufferData = (buf) => {
    if (buf == null) return false;
    if (Buffer.isBuffer(buf)) return buf.length > 0;
    if (typeof buf === 'object' && Array.isArray(buf.data)) return buf.data.length > 0;
    return false;
  };

  const hasCloudinaryRef = (d) => {
    const pid = d?.publicId;
    return typeof pid === 'string' && pid.trim().length > 0;
  };

  const slotHasAttachment = (d) => hasBufferData(d?.data) || hasCloudinaryRef(d);

  const rawDocuments = Array.isArray(o.documents) ? o.documents : [];

  if (rawDocuments.length > 0) {
    for (const d of rawDocuments) {
      if (!d) continue;
      if (!slotHasAttachment(d)) continue;
      const { data: _data, publicId: _pid, resourceType: _rt, format: _fmt, ...meta } = d;
      const name = meta.name || 'attachment';
      const contentType = meta.contentType || 'application/octet-stream';
      if (name || contentType) metaList.push({ name, contentType });
    }
    // If list queries stripped subdoc fields but slots still exist, keep one client row per file
    // so HR can call GET .../supporting-document?index=i (indices must match fileSlots on server).
    for (let i = metaList.length; i < rawDocuments.length; i++) {
      metaList.push({
        name: `Attachment ${i + 1}`,
        contentType: 'application/octet-stream',
      });
    }
  } else if (o.document && slotHasAttachment(o.document)) {
    const d = o.document;
    const { data: _data, publicId: _pid, resourceType: _rt, format: _fmt, ...meta } = d;
    const name = meta.name || 'attachment';
    const contentType = meta.contentType || 'application/octet-stream';
    if (name || contentType) metaList.push({ name, contentType });
  }

  delete o.document;
  if (metaList.length) o.documents = metaList;
  else delete o.documents;

  return o;
}

function travelOrdersToClientJson(docs) {
  if (!Array.isArray(docs)) return docs;
  return docs.map((d) => travelOrderToClientJson(d));
}

module.exports = { travelOrderToClientJson, travelOrdersToClientJson };
