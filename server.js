require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/database');

const app = express();
app.set('trust proxy', 1);

connectDB();

// ─── SECURITY HEADERS ───
app.use(helmet({
  contentSecurityPolicy: false, // onclick lar uchun
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// ─── CORS ───
app.use(cors({
  origin: process.env.CLIENT_URL || true,
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ─── RATE LIMITING ───
// Global
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Juda ko\'p so\'rov. Bir oz kuting.' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// Auth endpointlar uchun qattiqroq
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: '5 ta urinishdan so\'ng 15 daqiqa kuting.' },
  skipSuccessfulRequests: true,
}));
app.use('/api/auth/signup', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Juda ko\'p ro\'yxatdan o\'tish urinishi.' },
}));

// ─── PARSERS ───
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(cookieParser());

// ─── INPUT SANITIZATION ───
app.use(function(req, res, next) {
  function sanitize(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    for (var key in obj) {
      if (typeof obj[key] === 'string') {
        // XSS himoya - script taglarini tozalash
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
    return obj;
  }
  // Body va query ni sanitize qilish (parol bundan mustasno)
  if (req.body && req.path !== '/api/auth/login' && req.path !== '/api/auth/signup') {
    sanitize(req.body);
  }
  if (req.query) sanitize(req.query);
  next();
});

// ─── STATIC ───
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
}));

// ─── API ROUTES ───
app.use('/api/auth', require('./routes/auth'));
app.use('/api/public', require('./routes/public'));
app.use('/api/salon', require('./routes/salon'));
app.use('/api/admin', require('./routes/admin'));

// ─── HEALTH ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', version: 'v18', timestamp: new Date().toISOString() });
});

// ─── SPA FALLBACK ───
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── ERROR HANDLER ───
app.use((err, req, res, next) => {
  console.error('Server xatosi:', err.stack);
  if (err.name === 'ValidationError') {
    const msgs = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ success: false, message: msgs[0] });
  }
  if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Noto\'g\'ri ID' });
  if (err.code === 11000) return res.status(409).json({ success: false, message: 'Bu ma\'lumot allaqachon mavjud' });
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Server xatosi' : err.message,
  });
});

// ─── START ───
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════╗
║     BronUz v18 ishga tushdi      ║
║  Port: ${PORT}  | ${process.env.NODE_ENV || 'development'}          ║
║  Security: helmet + sanitize     ║
╚══════════════════════════════════╝
  `);
});

module.exports = app;
