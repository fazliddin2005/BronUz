const jwt = require('jsonwebtoken');

const generateAccessToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m' });

const generateRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' });

const verifyAccess = (token) => jwt.verify(token, process.env.JWT_ACCESS_SECRET);
const verifyRefresh = (token) => jwt.verify(token, process.env.JWT_REFRESH_SECRET);

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const sendTokens = async (user, res, status = 200, message = 'OK') => {
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  await user.updateOne({
    $push: { refreshTokens: { $each: [refreshToken], $slice: -5 } },
    $unset: { loginAttempts: 1, lockUntil: 1 },
  });

  res.cookie('rt', refreshToken, cookieOpts);
  res.status(status).json({ success: true, message, accessToken, user: user.toPublic() });
};

module.exports = { generateAccessToken, generateRefreshToken, verifyAccess, verifyRefresh, cookieOpts, sendTokens };
