const router = require('express').Router();
const User = require('../models/User');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');

// GET /api/public/salons — barcha salonlarni ko'rish (login siz)
router.get('/salons', async (req, res) => {
  try {
    const { category, city, search, lat, lng } = req.query;

    const filter = {
      role: 'salon_owner',
      isActive: true,
      'salon.name': { $exists: true, $ne: '' },
    };

    if (category) filter['salon.category'] = category;
    if (city) filter['salon.city'] = city;
    if (search) {
      filter.$or = [
        { 'salon.name': { $regex: search, $options: 'i' } },
        { 'salon.description': { $regex: search, $options: 'i' } },
        { 'salon.address': { $regex: search, $options: 'i' } },
      ];
    }

    let salons = await User.find(filter)
      .select('name salon services createdAt')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Geolokatsiya bo'yicha saralash
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      salons = salons
        .map(s => {
          const sLat = s.salon?.lat ? parseFloat(s.salon.lat) : null;
          const sLng = s.salon?.lng ? parseFloat(s.salon.lng) : null;
          let distance = null;
          if (sLat && sLng) {
            // Haversine formula — km
            const R = 6371;
            const dLat = (sLat - userLat) * Math.PI / 180;
            const dLon = (sLng - userLng) * Math.PI / 180;
            const a = Math.sin(dLat/2)**2 + Math.cos(userLat*Math.PI/180) * Math.cos(sLat*Math.PI/180) * Math.sin(dLon/2)**2;
            distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          }
          return { ...s, distance };
        })
        .sort((a, b) => {
          if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
          if (a.distance !== null) return -1;
          if (b.distance !== null) return 1;
          return 0;
        });
    }

    res.json({ success: true, salons, total: salons.length });
  } catch (e) {
    console.error('Public salons:', e);
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

// GET /api/public/salons/:id — bitta salon
router.get('/salons/:id', async (req, res) => {
  try {
    const salon = await User.findOne({
      _id: req.params.id,
      role: 'salon_owner',
      isActive: true,
    }).select('name salon services').lean();

    if (!salon) return res.status(404).json({ success: false, message: 'Topilmadi' });
    res.json({ success: true, salon });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

// POST /api/public/bookings/:salonId — navbat olish (login siz ham mumkin)
router.post('/bookings/:salonId', async (req, res) => {
  try {
    const { service, client, dateTime, payment } = req.body;

    if (!service || !client || !dateTime) {
      return res.status(400).json({ success: false, message: 'Xizmat, mijoz va vaqt kerak' });
    }
    if (!client.name || !client.phone) {
      return res.status(400).json({ success: false, message: 'Ism va telefon kerak' });
    }
    if (!/^\+998[0-9]{9}$/.test(client.phone)) {
      return res.status(400).json({ success: false, message: 'Telefon formati: +998901234567' });
    }

    const salon = await User.findOne({
      _id: req.params.salonId,
      role: 'salon_owner',
      isActive: true,
    });
    if (!salon) return res.status(404).json({ success: false, message: 'Salon topilmadi' });

    // Chek rasm hajmi tekshirish (max 5MB base64)
    if (payment?.chekImage && payment.chekImage.length > 7 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Chek rasmi juda katta (max 5MB)' });
    }

    const dep = Math.round(service.price * 0.1);
    const method = payment?.method || 'payme';
    const isCash = method === 'cash';

    const booking = await Booking.create({
      salon: req.params.salonId,
      service,
      client,
      dateTime: new Date(dateTime),
      status: isCash ? 'pending' : 'confirmed',
      payment: {
        method,
        deposit: dep,
        depositPaid: false,
        total: service.price,
        chekImage: payment?.chekImage || null,
      },
    });

    // Transaction log yozish
    try {
      await Transaction.create({
        client: {
          name: client.name,
          phone: client.phone,
          ip: req.ip || req.headers['x-forwarded-for'],
        },
        salon: {
          id: salon._id,
          name: salon.salon?.name || salon.name,
          phone: salon.salon?.phone || salon.phone,
          category: salon.salon?.category,
        },
        booking: {
          id: booking._id,
          service: service.name,
          dateTime: new Date(dateTime),
        },
        amount: dep,
        totalPrice: service.price,
        method,
        status: isCash ? 'pending' : 'pending',
        chekImage: payment?.chekImage || null,
        ip: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent'],
      });
    } catch(txErr) {
      console.error('Transaction log xatosi:', txErr);
    }

    res.status(201).json({
      success: true,
      booking,
      message: 'Navbat muvaffaqiyatli band qilindi!',
    });
  } catch (e) {
    console.error('Public booking:', e);
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

module.exports = router;
