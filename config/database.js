const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB ulandi');
    mongoose.connection.on('error', err => console.error('MongoDB xato:', err));
  } catch (err) {
    console.error('❌ MongoDB ulanmadi:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
