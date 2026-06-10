const Role = require('../models/Role');
const Faculty = require('../models/Faculty');
const Extension = require('../models/Extension');

const SEED_ROLES = [
  { name: 'Office Staff', isSystem: false },
  { name: 'Faculty Staff', isSystem: false },
  { name: 'Program Head', isSystem: false },
  { name: 'Human Resource Personnel', isSystem: true },
  { name: 'Office Records', isSystem: false },
  { name: 'Faculty Dean', isSystem: false },
  { name: 'Security Personnel', isSystem: false },
  { name: 'admin', isSystem: true },
  { name: 'President', isSystem: true },
  { name: 'Vice President', isSystem: true },
];

const SEED_FACULTIES = [
  'Faculty of Agriculture and Life Sciences',
  'Faculty of Computing, Engineering, and Technology',
  'Faculty of Criminal Justice Education',
  'Faculty of Nursing and Allied Health Sciences',
  'Faculty of Humanities, Social Science, and Communication',
  'Faculty of Teacher Education',
  'Faculty of Business Management',
];

const SEED_EXTENSIONS = [
  { name: 'Main Campus', isMainCampus: true },
  { name: 'Baganga Campus', isMainCampus: false },
  { name: 'Banaybanay Campus', isMainCampus: false },
  { name: 'Cateel Campus', isMainCampus: false },
  { name: 'San Isidro Campus', isMainCampus: false },
  { name: 'Tarragona Campus', isMainCampus: false },
];

async function seedMetadata() {
  const roleCount = await Role.countDocuments();
  if (roleCount === 0) {
    await Role.insertMany(SEED_ROLES.map((r) => ({ ...r, active: true })));
    console.log('Seeded roles metadata');
  }

  const facultyCount = await Faculty.countDocuments();
  if (facultyCount === 0) {
    await Faculty.insertMany(SEED_FACULTIES.map((name) => ({ name, active: true })));
    console.log('Seeded faculties metadata');
  }

  const extensionCount = await Extension.countDocuments();
  if (extensionCount === 0) {
    await Extension.insertMany(SEED_EXTENSIONS.map((e) => ({ ...e, active: true })));
    console.log('Seeded extensions metadata');
  }
}

module.exports = { seedMetadata, SEED_ROLES, SEED_FACULTIES, SEED_EXTENSIONS };
