const express = require('express');
const router = express.Router();
const { serverNow } = require('../utils/dateTime');

router.get('/', (req, res) => {
  res.json({
    serverTime: serverNow().getTime(),
    timezone: 'Asia/Manila',
  });
});

module.exports = router;
