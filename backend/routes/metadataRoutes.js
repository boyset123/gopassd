const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Role = require('../models/Role');
const Faculty = require('../models/Faculty');
const Extension = require('../models/Extension');
const User = require('../models/User');

const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('x-auth-token');
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
    const user = await User.findById(decoded.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

router.get('/roles', async (req, res) => {
  try {
    const roles = await Role.find({ active: true, name: { $ne: 'admin' } })
      .sort({ name: 1 })
      .select('name');
    res.json(roles.map((r) => r.name));
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/faculties', async (req, res) => {
  try {
    const faculties = await Faculty.find({ active: true }).sort({ name: 1 }).select('name');
    res.json(faculties.map((f) => f.name));
  } catch (error) {
    console.error('Get faculties error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/extensions', async (req, res) => {
  try {
    const extensions = await Extension.find({ active: true }).sort({ isMainCampus: -1, name: 1 }).select('name isMainCampus');
    res.json(extensions.map((e) => e.name));
  } catch (error) {
    console.error('Get extensions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/registration-options', async (req, res) => {
  try {
    const [roles, faculties, extensions] = await Promise.all([
      Role.find({ active: true, name: { $ne: 'admin' } }).sort({ name: 1 }).select('name'),
      Faculty.find({ active: true }).sort({ name: 1 }).select('name'),
      Extension.find({ active: true }).sort({ isMainCampus: -1, name: 1 }).select('name'),
    ]);
    res.json({
      roles: roles.map((r) => r.name),
      faculties: faculties.map((f) => f.name),
      extensions: extensions.map((e) => e.name),
    });
  } catch (error) {
    console.error('Get registration options error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/roles', adminAuth, async (req, res) => {
  try {
    const roles = await Role.find().sort({ name: 1 });
    res.json(roles);
  } catch (error) {
    console.error('Get admin roles error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/faculties', adminAuth, async (req, res) => {
  try {
    const faculties = await Faculty.find().sort({ name: 1 });
    res.json(faculties);
  } catch (error) {
    console.error('Get admin faculties error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/extensions', adminAuth, async (req, res) => {
  try {
    const extensions = await Extension.find().sort({ isMainCampus: -1, name: 1 });
    res.json(extensions);
  } catch (error) {
    console.error('Get admin extensions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/admin/roles', adminAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Role name is required.' });
    }
    if (name === 'admin') {
      return res.status(400).json({ message: 'Cannot create admin role via this endpoint.' });
    }
    const existing = await Role.findOne({ name });
    if (existing) {
      if (!existing.active) {
        existing.active = true;
        await existing.save();
        return res.status(200).json(existing);
      }
      return res.status(400).json({ message: 'Role already exists.' });
    }
    const role = await Role.create({ name, active: true, isSystem: false });
    res.status(201).json(role);
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/admin/faculties', adminAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Faculty name is required.' });
    }
    const existing = await Faculty.findOne({ name });
    if (existing) {
      if (!existing.active) {
        existing.active = true;
        await existing.save();
        return res.status(200).json(existing);
      }
      return res.status(400).json({ message: 'Faculty already exists.' });
    }
    const faculty = await Faculty.create({ name, active: true });
    res.status(201).json(faculty);
  } catch (error) {
    console.error('Create faculty error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/admin/extensions', adminAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const isMainCampus = Boolean(req.body?.isMainCampus);
    if (!name) {
      return res.status(400).json({ message: 'Extension name is required.' });
    }
    const existing = await Extension.findOne({ name });
    if (existing) {
      if (!existing.active) {
        existing.active = true;
        await existing.save();
        return res.status(200).json(existing);
      }
      return res.status(400).json({ message: 'Extension already exists.' });
    }
    const extension = await Extension.create({ name, active: true, isMainCampus });
    res.status(201).json(extension);
  } catch (error) {
    console.error('Create extension error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/admin/roles/:id', adminAuth, async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found.' });
    }
    if (role.isSystem && req.body.active === false) {
      return res.status(403).json({ message: 'System roles cannot be deactivated.' });
    }
    if (typeof req.body.active === 'boolean') {
      role.active = req.body.active;
    }
    if (req.body.name && !role.isSystem) {
      role.name = String(req.body.name).trim();
    }
    await role.save();
    res.json(role);
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/admin/faculties/:id', adminAuth, async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id);
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found.' });
    }
    if (typeof req.body.active === 'boolean') {
      faculty.active = req.body.active;
    }
    if (req.body.name) {
      faculty.name = String(req.body.name).trim();
    }
    await faculty.save();
    res.json(faculty);
  } catch (error) {
    console.error('Update faculty error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/admin/extensions/:id', adminAuth, async (req, res) => {
  try {
    const extension = await Extension.findById(req.params.id);
    if (!extension) {
      return res.status(404).json({ message: 'Extension not found.' });
    }
    if (typeof req.body.active === 'boolean') {
      extension.active = req.body.active;
    }
    if (req.body.name) {
      extension.name = String(req.body.name).trim();
    }
    if (typeof req.body.isMainCampus === 'boolean') {
      extension.isMainCampus = req.body.isMainCampus;
    }
    await extension.save();
    res.json(extension);
  } catch (error) {
    console.error('Update extension error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
