const router = require('express').Router();
const User = require('../models/User');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

// ── DASHBOARD STATS ──
router.get('/stats', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - 7);

    const [
      totalSalons, activeSalons, totalClients,
      todayBookings, monthBookings, totalBookings,
      pendingTx, confirmedTx, totalTxAmount,
      planCounts
    ] = await Promise.all([
      User.countDocuments({ role: 'salon_owner' }),
      User.countDocuments({ role: 'salon_owner', isActive: true }),
      User.countDocuments({ role: 'client' }),
      Booking.countDocuments({ createdAt: { $gte: today } }),
      Booking.countDocuments({ createdAt: { $gte: monthStart } }),
      Booking.countDocuments({}),
      Transaction.countDocuments({ status: 'pending' }),
      Transaction.countDocuments({ status: 'confirmed' }),
      Transaction.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      User.aggregate([{ $match: { role: 'salon_owner' } }, { $group: { _id: '$plan', count: { $sum: 1 } } }])
    ]);

    const prices = { starter: 49000, pro: 99000, business: 199000, trial: 0 };
    const mrr = planCounts.reduce((s, p) => s + (prices[p._id] || 0) * p.count, 0);
    const planMap = Object.fromEntries(planCounts.map(p => [p._id, p.count]));
    const totalDeposits = totalTxAmount[0]?.total || 0;

    res.json({ success: true, stats: {
      totalSalons, activeSalons, totalClients,
      todayBookings, monthBookings, totalBookings,
      pendingTx, confirmedTx, totalDeposits,
      mrr, mrrUSD: Math.round(mrr / 12400),
      plans: planMap,
    }});
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SALONLAR ──
router.get('/salons', async (req, res) => {
  try {
    const { page=1, limit=20, plan, search, isActive } = req.query;
    const filter = { role: 'salon_owner' };
    if (plan) filter.plan = plan;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { 'salon.name': { $regex: search, $options: 'i' } },
    ];
    const [salons, total] = await Promise.all([
      User.find(filter).select('-password -refreshTokens -loginHistory').sort({ createdAt: -1 }).skip((page-1)*limit).limit(+limit),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, salons, total });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// Salon boshqarish
router.patch('/salons/:id', async (req, res) => {
  try {
    const { isActive, plan } = req.body;
    const updates = {};
    if (isActive !== undefined) updates.isActive = isActive;
    if (plan) updates.plan = plan;
    const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).select('-password -refreshTokens');
    if (!user) return res.status(404).json({ success: false, message: 'Topilmadi' });
    res.json({ success: true, user: user.toPublic() });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// Salon o'chirish
router.delete('/salons/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    await Booking.deleteMany({ salon: req.params.id });
    res.json({ success: true, message: 'Salon o\'chirildi' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── FOYDALANUVCHILAR ──
router.get('/users', async (req, res) => {
  try {
    const { page=1, limit=20, role, search } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
    const [users, total] = await Promise.all([
      User.find(filter).select('name phone role plan isActive lastLoginAt lastLoginIp loginHistory createdAt').sort({ createdAt: -1 }).skip((page-1)*limit).limit(+limit),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, users, total });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// Foydalanuvchi login tarixi
router.get('/users/:id/logins', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name phone loginHistory lastLoginAt lastLoginIp');
    if (!user) return res.status(404).json({ success: false, message: 'Topilmadi' });
    res.json({ success: true, user });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── NAVBATLAR ──
router.get('/bookings', async (req, res) => {
  try {
    const { page=1, limit=20, status, date } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (date) {
      const d = new Date(date); const n = new Date(d); n.setDate(n.getDate()+1);
      filter.dateTime = { $gte: d, $lt: n };
    }
    const [bookings, total] = await Promise.all([
      Booking.find(filter).populate('salon', 'name phone salon.name').sort({ createdAt: -1 }).skip((page-1)*limit).limit(+limit),
      Booking.countDocuments(filter),
    ]);
    res.json({ success: true, bookings, total });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── TRANZAKSIYALAR ──
router.get('/transactions', async (req, res) => {
  try {
    const { page=1, limit=20, status, method, search, dateFrom, dateTo } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (method) filter.method = method;
    if (search) filter.$or = [
      { 'client.name': { $regex: search, $options: 'i' } },
      { 'client.phone': { $regex: search, $options: 'i' } },
      { 'salon.name': { $regex: search, $options: 'i' } },
    ];
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    const [txs, total, summary] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(+limit),
      Transaction.countDocuments(filter),
      Transaction.aggregate([
        { $match: filter },
        { $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          confirmedAmount: { $sum: { $cond: [{ $eq: ['$status','confirmed'] }, '$amount', 0] } },
          pendingAmount: { $sum: { $cond: [{ $eq: ['$status','pending'] }, '$amount', 0] } },
          count: { $sum: 1 },
        }}
      ])
    ]);
    res.json({ success: true, transactions: txs, total, summary: summary[0] || {} });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// Tranzaksiyani tasdiqlash/rad etish (admin)
router.patch('/transactions/:id', async (req, res) => {
  try {
    const { status, note } = req.body;
    const tx = await Transaction.findByIdAndUpdate(
      req.params.id,
      { $set: { status, note, chekConfirmedBy: req.user._id, chekConfirmedAt: new Date() } },
      { new: true }
    );
    if (!tx) return res.status(404).json({ success: false, message: 'Topilmadi' });
    // Booking ni ham yangilash
    if (tx.booking?.id) {
      await Booking.findByIdAndUpdate(tx.booking.id, {
        $set: { 'payment.depositPaid': status === 'confirmed' }
      });
    }
    res.json({ success: true, transaction: tx });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── TIZIM LOGLARI ──
router.get('/logs', async (req, res) => {
  try {
    const { limit=50 } = req.query;
    // Oxirgi login tarixi barcha foydalanuvchilardan
    const users = await User.find({ 'loginHistory.0': { $exists: true } })
      .select('name phone role loginHistory lastLoginAt lastLoginIp')
      .limit(+limit);

    const logs = [];
    users.forEach(u => {
      (u.loginHistory || []).slice(-5).reverse().forEach(l => {
        logs.push({
          user: u.name,
          phone: u.phone,
          role: u.role,
          ip: l.ip,
          device: l.device,
          userAgent: l.userAgent,
          timestamp: l.timestamp,
          success: l.success,
        });
      });
    });

    logs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ success: true, logs: logs.slice(0, +limit) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SOZLAMALAR ──
router.get('/settings', async (req, res) => {
  res.json({ success: true, settings: {
    plans: { starter: 49000, pro: 99000, business: 199000 },
    depositPercent: 10,
    trialDays: 30,
    maxPhotos: 5,
    platform: 'BronUz',
    version: 'v19',
  }});
});

module.exports = router;
