const Role = require('../models/Role');
const Faculty = require('../models/Faculty');
const Extension = require('../models/Extension');

const FACULTY_ROLES = ['Faculty Staff', 'Program Head', 'Faculty Dean'];

function requiresFaculty(roleName) {
  return FACULTY_ROLES.includes(roleName);
}

async function validateActiveRole(roleName, { excludeAdmin = true } = {}) {
  const name = String(roleName || '').trim();
  if (!name) {
    return { valid: false, message: 'Role is required.' };
  }
  if (excludeAdmin && name === 'admin') {
    return { valid: false, message: 'Invalid role selection.' };
  }
  const role = await Role.findOne({ name, active: true });
  if (!role) {
    return { valid: false, message: 'Selected role is not available.' };
  }
  return { valid: true, name };
}

async function validateActiveFaculty(facultyName) {
  const name = String(facultyName || '').trim();
  if (!name) {
    return { valid: false, message: 'Faculty is required for this role.' };
  }
  const faculty = await Faculty.findOne({ name, active: true });
  if (!faculty) {
    return { valid: false, message: 'Selected faculty is not available.' };
  }
  return { valid: true, name };
}

async function validateActiveExtension(extensionName) {
  const name = String(extensionName || '').trim();
  if (!name) {
    return { valid: false, message: 'Campus / extension is required.' };
  }
  const extension = await Extension.findOne({ name, active: true });
  if (!extension) {
    return { valid: false, message: 'Selected campus / extension is not available.' };
  }
  return { valid: true, name };
}

async function validateRegistrationMetadata({ role, faculty, campus }) {
  const roleResult = await validateActiveRole(role);
  if (!roleResult.valid) return roleResult;

  const extensionResult = await validateActiveExtension(campus);
  if (!extensionResult.valid) return extensionResult;

  if (requiresFaculty(roleResult.name)) {
    const facultyResult = await validateActiveFaculty(faculty);
    if (!facultyResult.valid) return facultyResult;
    return {
      valid: true,
      role: roleResult.name,
      campus: extensionResult.name,
      faculty: facultyResult.name,
    };
  }

  return {
    valid: true,
    role: roleResult.name,
    campus: extensionResult.name,
    faculty: undefined,
  };
}

module.exports = {
  FACULTY_ROLES,
  requiresFaculty,
  validateActiveRole,
  validateActiveFaculty,
  validateActiveExtension,
  validateRegistrationMetadata,
};
