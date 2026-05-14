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

  if (Array.isArray(o.documents) && o.documents.length > 0) {
    for (const d of o.documents) {
      if (!d) continue;
      const { data: _data, ...meta } = d;
      if (meta.name || meta.contentType) metaList.push({ name: meta.name, contentType: meta.contentType });
    }
  } else if (o.document) {
    const { data: _data, ...meta } = o.document;
    if (meta.name || meta.contentType) metaList.push({ name: meta.name, contentType: meta.contentType });
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
