require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const passSlipRoutes = require('./routes/passSlipRoutes');
const travelOrderRoutes = require('./routes/travelOrderRoutes');
const recordsRoutes = require('./routes/recordsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const admin = require('firebase-admin');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const User = require('./models/User');

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw && String(raw).trim()) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON:', e.message);
      throw e;
    }
  }
  const keyPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(keyPath)) {
    return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  }
  throw new Error(
    'Firebase admin: set FIREBASE_SERVICE_ACCOUNT_JSON in the environment, or add serviceAccountKey.json for local dev.'
  );
}

admin.initializeApp({
  credential: admin.credential.cert(loadServiceAccount())
});

const app = express();
const server = http.createServer(app); // Create HTTP server from Express app
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for now, you might want to restrict this in production
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// reCAPTCHA page for mobile WebView — document origin must match a domain allowed in Google Admin (e.g. 192.168.x.x or your API hostname)
function escapeHtmlAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;');
}

app.get('/recaptcha-embed', (req, res) => {
  const siteKey = req.query.sitekey || process.env.RECAPTCHA_SITE_KEY;
  if (!siteKey || typeof siteKey !== 'string') {
    return res.status(400).type('text').send('Missing sitekey query parameter or RECAPTCHA_SITE_KEY in .env');
  }
  const safe = escapeHtmlAttr(siteKey);
  res.type('html').send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <script src="https://www.google.com/recaptcha/api.js" async defer></script>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; }
    body { display: flex; justify-content: center; align-items: flex-start; min-height: 90px; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="g-recaptcha" data-sitekey="${safe}" data-callback="onRecaptchaSuccess" data-expired-callback="onRecaptchaExpired"></div>
  <script>
    function onRecaptchaSuccess(token) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'token', token: token }));
      }
    }
    function onRecaptchaExpired() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'expired' }));
      }
    }
  </script>
</body>
</html>`);
});

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gopassdorsu';

// Helpful connection-state logs for diagnosing startup/network issues.
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

// Middleware to attach io to each request
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pass-slips', passSlipRoutes);
app.use('/api/travel-orders', travelOrderRoutes);
app.use('/api/records', recordsRoutes);
app.use('/api/notifications', notificationRoutes);

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
  });
});

// Cron job to reset pass slip minutes every Monday at midnight
cron.schedule('0 0 * * 1', async () => {
  console.log('Running weekly reset of pass slip minutes...');
  try {
    await User.updateMany({}, { $set: { passSlipMinutes: 120 } });
    console.log('Successfully reset pass slip minutes for all users.');
  } catch (error) {
    console.error('Error resetting pass slip minutes:', error);
  }
});

// Basic route
app.get('/', (req, res) => {
  res.send('GOPASS DORSU API is running...');
});

// Start server only after MongoDB is available.
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    console.log(`Connecting to MongoDB: ${mongoUri}`);
    await mongoose.connect(mongoUri);

    server.listen(PORT, async () => {
      console.log(`Server running on port ${PORT}`);
      // Create admin and president users only when DB is reachable.
      await createAdminUser();
      await createPresidentUser();
    });
  } catch (err) {
    console.error('Failed to start server: MongoDB is unreachable.', err);
    process.exit(1);
  }
}

startServer();

// Function to create admin user
async function createAdminUser() {
  const User = require('./models/User');
  
  try {
    const adminExists = await User.findOne({ email: 'admin@dorsu' });
    
    if (!adminExists) {
      const adminUser = new User({
        email: 'admin@dorsu',
        password: 'admin123',
        role: 'admin',
        name: 'Admin User',
        campus: 'Main Campus' // Add a default campus
      });
      
      await adminUser.save();
      console.log('Admin user created successfully');
    }
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
}

// Function to create president user
async function createPresidentUser() {
  const User = require('./models/User');

  try {
    const presidentExists = await User.findOne({ email: 'president@dorsu' });

    if (!presidentExists) {
      const presidentUser = new User({
        email: 'president@dorsu',
        password: 'president123',
        role: 'President',
        name: 'President User',
        campus: 'Main Campus' // Add a default campus
      });

      await presidentUser.save();
      console.log('President user created successfully');
    }
  } catch (error) {
    console.error('Error creating president user:', error);
  }
}

