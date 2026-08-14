const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI topilmadi!');
  process.exit(1);
}

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('MongoDB ulandi...');

  // Avval bor-yoqligini tekshirish
  const existing = await mongoose.connection.db.collection('users')
    .findOne({ phone: '+998999193322', role: 'admin' });

  if (existing) {
    console.log('Admin allaqachon mavjud!');
    process.exit(0);
  }

  const hash = await bcrypt.hash('Fazliddin_30042005', 12);

  await mongoose.connection.db.collection('users').insertOne({
    name: 'Fazliddin',
    phone: '+998999193322',
    password: hash,
    role: 'admin',
    isActive: true,
    plan: 'business',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log('✅ Admin yaratildi!');
  console.log('📱 Telefon: +998999193322');
  console.log('🔑 Parol: Fazliddin_30042005');
  process.exit(0);
}).catch(function(e) {
  console.error('Xato:', e.message);
  process.exit(1);
});
