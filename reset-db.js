require('dotenv').config();
const mongoose = require('mongoose');

async function resetDB() {
  try {
    console.log('MongoDB ga ulanmoqda...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Ulandi');

    const db = mongoose.connection.db;

    // Users collectionni to'liq tozalash
    await db.collection('users').deleteMany({});
    console.log('✅ Barcha userlar o\'chirildi');

    // Bookings ham tozalash
    await db.collection('bookings').deleteMany({});
    console.log('✅ Barcha navbatlar o\'chirildi');

    // Eski indexlarni o'chirish
    try {
      await db.collection('users').dropIndex('phone_1');
      console.log('✅ Eski phone index o\'chirildi');
    } catch(e) {
      console.log('ℹ️  Eski index yo\'q (normal)');
    }

    // Yangi to'g'ri index yaratish: phone + role kombinatsiyasi unique
    await db.collection('users').createIndex(
      { phone: 1, role: 1 },
      { unique: true, name: 'phone_role_unique' }
    );
    console.log('✅ Yangi phone+role unique index yaratildi');

    console.log('\n🎉 Database tozalandi! Endi yangi akk ochishingiz mumkin.');
    process.exit(0);
  } catch(e) {
    console.error('❌ Xato:', e.message);
    process.exit(1);
  }
}

resetDB();
