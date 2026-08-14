const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  salon: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  service: {
    name: { type: String, required: true },
    duration: { type: Number, required: true },
    price: { type: Number, required: true },
  },
  client: {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    note: { type: String, trim: true, maxlength: 300 },
  },
  dateTime: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['pending','confirmed','completed','cancelled','no_show'],
    default: 'confirmed',
    index: true,
  },
  payment: {
    method: { type: String, enum: ['cash','payme','click','paynet','none'], default: 'none' },
    deposit: { type: Number, default: 0 },
    depositPaid: { type: Boolean, default: false },
    total: { type: Number, default: 0 },
    chekImage: { type: String }, // base64 chek rasmi
  },
}, { timestamps: true });

bookingSchema.index({ salon: 1, dateTime: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
