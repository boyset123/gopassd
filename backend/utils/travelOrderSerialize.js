const User = require('../models/User');

function travelOrderEmployeeId(employee) {
  if (employee == null) return null;
  if (typeof employee === 'string') return employee;
  if (typeof employee === 'object') {
    if (employee._id != null) return String(employee._id);
    if (employee.constructor && employee.constructor.name === 'ObjectId') return String(employee);
  }
  return null;
}

function travelOrderEmployeeRoleMissing(employee) {
  if (employee == null) return false;
  if (typeof employee === 'string') return true;
  if (typeof employee === 'object') {
    if (employee.constructor && employee.constructor.name === 'ObjectId') return true;
    if (employee.role == null) return true;
    if (typeof employee.role === 'string' && employee.role.trim() === '') return true;
  }
  return false;
}

/**
 * Ensures each order's `employee.role` and `employeeRole` are set when populate omitted role
 * or `employee` is still an ObjectId (mutates Mongoose docs or plain lean objects in place).
 */
async function attachEmployeeRoleFallback(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return;

  const ids = new Set();
  for (const order of orders) {
    if (!order || typeof order !== 'object') continue;
    const e = order.employee;
    const id = travelOrderEmployeeId(e);
    if (!id || !travelOrderEmployeeRoleMissing(e)) continue;
    ids.add(id);
  }
  if (ids.size === 0) return;

  const users = await User.find({ _id: { $in: [...ids] } })
    .select('name email profilePicture role')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  for (const order of orders) {
    if (!order || typeof order !== 'object') continue;
    const e = order.employee;
    const id = travelOrderEmployeeId(e);
    if (!id || !travelOrderEmployeeRoleMissing(e)) continue;
    const u = byId.get(id);
    if (!u || u.role == null || String(u.role).trim() === '') continue;

    if (typeof e === 'string' || (e && e.constructor && e.constructor.name === 'ObjectId')) {
      order.employee = {
        _id: u._id,
        name: u.name,
        email: u.email,
        profilePicture: u.profilePicture,
        role: u.role,
      };
    } else if (typeof e === 'object') {
      e.role = u.role;
      if (!e.name && u.name) e.name = u.name;
      if (!e.email && u.email) e.email = u.email;
      if (e.profilePicture == null && u.profilePicture != null) e.profilePicture = u.profilePicture;
    }

    if (order.employeeRole == null || String(order.employeeRole).trim() === '') {
      order.employeeRole = u.role;
    }
  }
}

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

module.exports = { travelOrderToClientJson, travelOrdersToClientJson, attachEmployeeRoleFallback };
