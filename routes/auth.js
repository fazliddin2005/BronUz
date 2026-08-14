const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const User = require('../models/User');
const { sendTokens, verifyRefresh } = require('../utils/jwt');
const { protect } = require('../middleware/auth');

const limiter = (max) => rateLimit({
  windowMs: 15 * 60 * 1000, max,
  message: { success: false, message: 'Juda ko\'p urinish. 15 daqiqa kuting.' },
});

const signupSchema = Joi.object({
  name: Joi.string().min(2).max(60).required()
    .pattern(/^[a-zA-Zа-яА-ЯёЁa-zA-ZЀ-ӿ\s'-]+$/)
    .messages({
      'any.required': 'Ism majburiy',
      'string.min': 'Ism kamida 2 ta belgi',
      'string.pattern.base': 'Ismda faqat harflar bolishi kerak',
    }),
  phone: Joi.string().pattern(/^\+998[0-9]{9}$/).required().messages({
    'string.pattern.base': 'Telefon formati: +998901234567',
    'any.required': 'Telefon majburiy',
  }),
  password: Joi.string().min(8).max(72)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required().messages({
      'string.min': 'Parol kamida 8 ta belgi',
      'string.max': 'Parol 72 ta belgidan oshmasin',
      'string.pattern.base': 'Parolda katta harf, kichik harf va raqam bolishi kerak',
      'any.required': 'Parol majburiy',
    }),
  role: Joi.string().valid('client', 'salon_owner', 'admin').default('client'),
  salonName: Joi.string().max(100).optional().allow(''),
});

const loginSchema = Joi.object({
  phone: Joi.string().pattern(/^\+998[0-9]{9}$/).required().messages({
    'string.pattern.base': 'Telefon formati: +998901234567',
    'any.required': 'Telefon majburiy',
  }),
  password: Joi.string().max(72).required().messages({ 'any.required': 'Parol majburiy' }),
  role: Joi.string().valid('client', 'salon_owner', 'admin').default('client'),
});

// ═══════════════════════════════════
// POST /api/auth/signup
// ═══════════════════════════════════
router.post('/signup', limiter(10), async (req, res) => {
  try {
    const { error, value } = signupSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const { name, phone, password, role, salonName } = value;

    // phone + role kombinatsiyasi unique
    // Bir nommer bilan salon_owner -> 1 ta, client -> 1 ta, lekin ikkalasi ham bo'lishi mumkin
    const exists = await User.findOne({ phone, role }).lean();
    if (exists) {
      const roleLabel = role === 'salon_owner' ? 'biznes egasi' : 'mijoz';
      return res.status(409).json({
        success: false,
        message: `Bu telefon raqamdan allaqachon ${roleLabel} sifatida ro'yxatdan o'tilgan`,
      });
    }

    const userData = { name, phone, password, role };
    if (role === 'salon_owner' && salonName) {
      userData.salon = { name: salonName };
    }

    const user = await User.create(userData);
    await sendTokens(user, res, 201, 'Hisob muvaffaqiyatli yaratildi!');
  } catch (e) {
    // MongoDB unique constraint xatosi
    if (e.code === 11000) {
      const role = req.body.role || 'client';
      const roleLabel = role === 'salon_owner' ? 'biznes egasi' : 'mijoz';
      return res.status(409).json({
        success: false,
        message: `Bu telefon raqamdan allaqachon ${roleLabel} sifatida ro'yxatdan o'tilgan`,
      });
    }
    console.error('Signup:', e);
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

// ═══════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════
router.post('/login', limiter(5), async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const { phone, password, role } = value;

    // phone + role bo'yicha qidirish
    const user = await User.findOne({ phone, role })
      .select('+password +loginAttempts +lockUntil +refreshTokens');

    if (!user) {
      await new Promise(r => setTimeout(r, 400));
      const roleLabel = role === 'salon_owner' ? 'biznes egasi' : 'mijoz';
      return res.status(401).json({
        success: false,
        message: `${roleLabel} hisob topilmadi. Avval ro'yxatdan o'ting.`,
      });
    }

    if (user.isLocked) {
      const min = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ success: false, message: `Hisob ${min} daqiqaga bloklangan` });
    }
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Hisob bloklangan' });

    const ok = await user.comparePassword(password);
    if (!ok) {
      await user.incLoginAttempts();
      const left = Math.max(0, 5 - (user.loginAttempts + 1));
      return res.status(401).json({
        success: false,
        message: left > 0 ? `Parol noto'g'ri. ${left} ta urinish qoldi` : 'Hisob 15 daqiqaga bloklandi',
      });
    }

    // Login tarixi saqlash
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const ua = req.headers['user-agent'] || '';
    const device = ua.includes('Mobile') ? 'Mobile' : ua.includes('Tablet') ? 'Tablet' : 'Desktop';
    await User.findByIdAndUpdate(user._id, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      $push: {
        loginHistory: {
          $each: [{ ip, userAgent: ua, device, timestamp: new Date(), success: true }],
          $slice: -20, // oxirgi 20 ta
        }
      }
    });

    await sendTokens(user, res, 200, 'Xush kelibsiz!');
  } catch (e) {
    console.error('Login:', e);
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

// ═══════════════════════════════════
// POST /api/auth/refresh
// ═══════════════════════════════════
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.rt;
    if (!token) return res.status(401).json({ success: false, message: 'Token topilmadi' });
    let decoded;
    try { decoded = verifyRefresh(token); }
    catch { res.clearCookie('rt'); return res.status(401).json({ success: false, message: 'Qayta kiring' }); }
    const user = await User.findOne({ _id: decoded.id, refreshTokens: token }).select('+refreshTokens');
    if (!user || !user.isActive) { res.clearCookie('rt'); return res.status(401).json({ success: false, message: 'Sessiya yaroqsiz' }); }
    await User.findByIdAndUpdate(user._id, { $pull: { refreshTokens: token } });
    await sendTokens(user, res, 200, 'Token yangilandi');
  } catch (e) { res.status(500).json({ success: false, message: 'Server xatosi' }); }
});

// ═══════════════════════════════════
// POST /api/auth/logout
// ═══════════════════════════════════
router.post('/logout', protect, async (req, res) => {
  const token = req.cookies?.rt;
  if (token) await User.findByIdAndUpdate(req.user._id, { $pull: { refreshTokens: token } });
  res.clearCookie('rt');
  res.json({ success: true, message: 'Chiqildi' });
});

// ═══════════════════════════════════
// GET /api/auth/me
// ═══════════════════════════════════
router.get('/me', protect, (req, res) => {
  res.json({ success: true, user: req.user.toPublic() });
});

// ═══════════════════════════════════
// PATCH /api/auth/change-password
// ═══════════════════════════════════
router.patch('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Ikkala parol kerak' });
    if (newPassword.length < 8) return res.status(400).json({ success: false, message: 'Parol kamida 8 ta belgi' });
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return res.status(400).json({ success: false, message: 'Parolda katta harf, kichik harf va raqam bolsin' });
    }
    const user = await User.findById(req.user._id).select('+password +refreshTokens');
    if (!await user.comparePassword(currentPassword)) return res.status(401).json({ success: false, message: 'Joriy parol noto\'g\'ri' });
    user.password = newPassword;
    user.refreshTokens = [];
    await user.save();
    res.clearCookie('rt');
    res.json({ success: true, message: 'Parol o\'zgartirildi. Qayta kiring.' });
  } catch (e) { res.status(500).json({ success: false, message: 'Server xatosi' }); }
});

module.exports = router;
