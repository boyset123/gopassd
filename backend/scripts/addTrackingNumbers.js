const mongoose = require('mongoose');
const PassSlip = require('../models/PassSlip');
const crypto = require('crypto');

// Replace with your MongoDB connection string
const dbURI = 'mongodb+srv://burgoschristopher18_db_user:129226090010@cluster0.mlvxjmk.mongodb.net/gopassdorsu';

const generateTrackingNumber = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

const addTrackingNumbers = async () => {
  try {
    await mongoose.connect(dbURI);
    console.log('MongoDB connected');

    const passSlipsToUpdate = await PassSlip.find({
      status: { $in: ['Approved', 'Verified', 'Returned', 'Completed'] },
      trackingNo: { $exists: false },
    });

    if (passSlipsToUpdate.length === 0) {
      console.log('No pass slips to update.');
      return;
    }

    console.log(`Found ${passSlipsToUpdate.length} pass slips to update.`);

    for (const slip of passSlipsToUpdate) {
      slip.trackingNo = generateTrackingNumber();
      await slip.save();
      console.log(`Updated PassSlip ${slip._id} with tracking number ${slip.trackingNo}`);
    }

    console.log('All pass slips updated successfully.');
  } catch (error) {
    console.error('Error updating pass slips:', error);
  } finally {
    mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
};

addTrackingNumbers();
