// src/models/PatientCalendar.js
const mongoose = require('mongoose');

const patientCalendarSchema = new mongoose.Schema({
  mrn: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  dob: { type: Date, required: true },
  diagnoses: [{ type: String }],
  medications: [{ type: String }],
  status: { type: String, default: 'active' }
});

module.exports = mongoose.model('PatientCalendar', patientCalendarSchema);