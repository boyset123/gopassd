const express = require('express');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const auth = require('../middleware/auth');
const { addSseClient, removeSseClient } = require('../services/changeStreamHub');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';
const SSE_TOKEN_EXPIRY = '5m';
const HEARTBEAT_MS = 25000;

function verifySseToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.purpose !== 'sse') {
    throw new Error('Invalid token purpose');
  }
  if (!decoded.userId) {
    throw new Error('Invalid token payload');
  }
  return decoded;
}

/** Mint a short-lived token for EventSource (cannot send x-auth-token header). */
router.post('/token', auth, (req, res) => {
  const token = jwt.sign(
    {
      userId: req.user.userId,
      role: req.user.role,
      purpose: 'sse',
    },
    JWT_SECRET,
    { expiresIn: SSE_TOKEN_EXPIRY }
  );
  res.json({ token, expiresIn: 300 });
});

/** SSE endpoint — authenticate via query token. */
router.get('/stream', (req, res) => {
  const rawToken = req.query.token;
  if (!rawToken || typeof rawToken !== 'string') {
    return res.status(401).json({ message: 'Missing token' });
  }

  let decoded;
  try {
    decoded = verifySseToken(rawToken);
  } catch {
    return res.status(401).json({ message: 'Token is not valid' });
  }

  const clientId = randomUUID();
  const userId = String(decoded.userId);
  const role = decoded.role || '';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(': connected\n\n');

  addSseClient(clientId, { res, userId, role });

  const heartbeat = setInterval(() => {
    try {
      if (!res.writableEnded) {
        res.write(': ping\n\n');
      }
    } catch {
      clearInterval(heartbeat);
      removeSseClient(clientId);
    }
  }, HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    removeSseClient(clientId);
    if (!res.writableEnded) {
      res.end();
    }
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
});

module.exports = router;
