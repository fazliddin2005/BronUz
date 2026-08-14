const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  phone: { type: String, required: true, trim: true, match: [/^\+998[0-9]{9}$/, 'Telefon: +998XXXXXXXXX'] },
  password: { type: String, required: true, minlength: 8, select: false },

  // role — unique kombinatsiya: phone + role
  role: { type: String, enum: ['salon_owner', 'client', 'admin'], default: 'client' },

  salon: {
    name: { type: String, trim: true },
    category: { type: String, enum: ['beauty','barber','dental','fitness','spa','clinic','other'], default: 'beauty' },
    address: { type: String, trim: true },
    city: { type: String, default: 'Toshkent' },
    description: { type: String, trim: true },
    phone: { type: String, trim: true },
    workHours: { start: { type: String, default: '09:00' }, end: { type: String, default: '20:00' } },
    lat: { type: String },
    lng: { type: String },
    photos: [{ type: String }],
    // To'lov rekvizitlari
    paymentInfo: {
      payme: { type: String, trim: true },   // Payme karta raqami
      click: { type: String, trim: true },   // Click karta raqami
      bank: { type: String, trim: true },    // Bank hisob raqami
      cardHolder: { type: String, trim: true }, // Karta egasi ismi
      description: { type: String, trim: true }, // Qo'shimcha ma'lumot
    },
  },

  services: [{
    name: { type: String, required: true },
    price: { type: Number, required: true },
    duration: { type: Number, required: true },
  }],

  plan: { type: String, enum: ['trial','starter','pro','business'], default: 'trial' },
  planExpiry: { type: Date, default: () => new Date(Date.now() + 30*24*60*60*1000) },
  isActive: { type: Boolean, default: true },
  loginAttempts: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
  refreshTokens: [{ type: String, select: false }],
  // Login tarixi
  loginHistory: [{
    ip: String,
    userAgent: String,
    device: String,
    timestamp: { type: Date, default: Date.now },
    success: Boolean,
  }],
  lastLoginAt: Date,
  lastLoginIp: String,
}, { timestamps: true, toJSON: { virtuals: true } });

// ═══ UNIQUE INDEX: phone + role ═══
// Bir nommer bilan salon_owner sifatida faqat 1 ta akk
// Bir nommer bilan client sifatida faqat 1 ta akk
// Lekin bir nommer bilan ham salon_owner ham client bo'lish mumkin
userSchema.index({ phone: 1, role: 1 }, { unique: true });

userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});
userSchema.virtual('trialDaysLeft').get(function() {
  if (this.plan !== 'trial') return 0;
  return Math.max(0, Math.ceil((this.planExpiry - Date.now()) / (1000*60*60*24)));
});

// Parolni avtomatik hash
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.incLoginAttempts = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $unset: { lockUntil: 1 }, $set: { loginAttempts: 1 } });
  }
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 15*60*1000 };
  }
  return this.updateOne(updates);
};

userSchema.methods.toPublic = function() {
  return {
    id: this._id, name: this.name, phone: this.phone,
    role: this.role, salon: this.salon, services: this.services,
    plan: this.plan, planExpiry: this.planExpiry,
    trialDaysLeft: this.trialDaysLeft, isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
