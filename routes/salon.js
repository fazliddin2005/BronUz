const router = require('express').Router();
const User = require('../models/User');
const Booking = require('../models/Booking');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('salon_owner', 'admin'));

router.get('/me', (req, res) => res.json({ success: true, user: req.user.toPublic() }));

router.patch('/me', async (req, res) => {
  try {
    const allowed = ['name', 'salon', 'services'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
    res.json({ success: true, user: user.toPublic(), message: 'Saqlandi' });
  } catch (e) { res.status(500).json({ success: false, message: 'Server xatosi' }); }
});

router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayBookings, monthCount, clients] = await Promise.all([
      Booking.find({ salon: req.user._id, dateTime: { $gte: today, $lt: tomorrow } }).sort({ dateTime: 1 }),
      Booking.countDocuments({ salon: req.user._id, dateTime: { $gte: monthStart }, status: { $ne: 'cancelled' } }),
      Booking.distinct('client.phone', { salon: req.user._id }),
    ]);

    const todayRevenue = todayBookings.filter(b => b.status === 'completed').reduce((s,b) => s + b.service.price, 0);

    res.json({ success: true, data: {
      todayBookings: todayBookings.length, todayRevenue,
      monthBookings: monthCount, totalClients: clients.length,
      bookings: todayBookings,
    }});
  } catch (e) { res.status(500).json({ success: false, message: 'Server xatosi' }); }
});

router.get('/bookings', async (req, res) => {
  try {
    const { date, status, page = 1, limit = 20 } = req.query;
    const filter = { salon: req.user._id };
    if (date) { const d = new Date(date); const n = new Date(d); n.setDate(n.getDate()+1); filter.dateTime = { $gte: d, $lt: n }; }
    if (status) filter.status = status;
    const [bookings, total] = await Promise.all([
      Booking.find(filter).sort({ dateTime: 1 }).skip((page-1)*limit).limit(+limit),
      Booking.countDocuments(filter),
    ]);
    res.json({ success: true, bookings, total, page: +page });
  } catch (e) { res.status(500).json({ success: false, message: 'Server xatosi' }); }
});

router.post('/bookings', async (req, res) => {
  try {
    const { service, client, dateTime } = req.body;
    if (!service || !client || !dateTime) return res.status(400).json({ success: false, message: 'Barcha maydonlar kerak' });
    const booking = await Booking.create({ salon: req.user._id, service, client, dateTime: new Date(dateTime) });
    res.status(201).json({ success: true, booking });
  } catch (e) { res.status(500).json({ success: false, message: 'Server xatosi' }); }
});

router.patch('/bookings/:id', async (req, res) => {
  try {
    const booking = await Booking.findOneAndUpdate({ _id: req.params.id, salon: req.user._id }, { $set: req.body }, { new: true });
    if (!booking) return res.status(404).json({ success: false, message: 'Topilmadi' });
    res.json({ success: true, booking });
  } catch (e) { res.status(500).json({ success: false, message: 'Server xatosi' }); }
});

module.exports = router;
