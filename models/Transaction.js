const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Kim to'ladi
  client: {
    name: { type: String },
    phone: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ip: { type: String },
  },
  // Qaysi salonga
  salon: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String },
    phone: { type: String },
    category: { type: String },
  },
  // Navbat
  booking: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    service: { type: String },
    dateTime: { type: Date },
  },
  // To'lov
  amount: { type: Number, required: true },       // Depozit summasi
  totalPrice: { type: Number },                   // Xizmat narxi
  method: {
    type: String,
    enum: ['payme', 'click', 'paynet', 'cash', 'bank', 'none'],
    default: 'none',
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'refunded'],
    default: 'pending',
  },
  // Chek
  chekImage: { type: String },                    // base64
  chekConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  chekConfirmedAt: { type: Date },

  // Meta
  note: { type: String },
  ip: { type: String },
  userAgent: { type: String },
}, { timestamps: true });

transactionSchema.index({ 'salon.id': 1 });
transactionSchema.index({ 'client.phone': 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ method: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
