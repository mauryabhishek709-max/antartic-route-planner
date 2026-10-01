const mongoose = require('mongoose');

const voyageSchema = new mongoose.Schema({
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  profile: { type: String, enum: ['FASTEST', 'ECO', 'SAFEST'], default: 'SAFEST' },
  distanceNM: { type: Number, required: true },
  transitTimeHrs: { type: Number, required: true },
  fuelTons: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Voyage', voyageSchema);