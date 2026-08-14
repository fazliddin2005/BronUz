const { verifyAccess } = require('../utils/jwt');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Kiring' });
    }
    const token = auth.split(' ')[1];
    let decoded;
    try { decoded = verifyAccess(token); }
    catch (e) {
      const msg = e.name === 'TokenExpiredError' ? 'Sessiya tugadi, qayta kiring' : 'Noto\'g\'ri token';
      return res.status(401).json({ success: false, message: msg, code: e.name });
    }
    const user = await User.findById(decoded.id).select('-password -refreshTokens');
    if (!user) return res.status(401).json({ success: false, message: 'Foydalanuvchi topilmadi' });
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Hisob bloklangan' });
    req.user = user;
    next();
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ success: false, message: 'Ruxsat yo\'q' });
  next();
};

module.exports = { protect, authorize };
