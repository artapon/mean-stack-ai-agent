// src/controllers/patientCalendarController.js
const PatientCalendar = require('../models/PatientCalendar');
const AppError = require('../utils/appError');

// Get all patient calendars
exports.getAll = async (req, res) => {
  try {
    const patientCalendars = await PatientCalendar.find().lean();
    res.status(200).json({ success: true, data: patientCalendars });
  } catch (error) {
    next(error);
  }
};

// Create a new patient calendar
exports.create = async (req, res) => {
  try {
    const patientCalendar = await PatientCalendar.create(req.body);
    res.status(201).json({ success: true, data: patientCalendar });
  } catch (error) {
    next(error);
  }
};

// Update an existing patient calendar
exports.update = async (req, res) => {
  const { id } = req.params;
  try {
    const patientCalendar = await PatientCalendar.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!patientCalendar) return next(new AppError('No patient calendar found with that ID', 404));
    res.status(200).json({ success: true, data: patientCalendar });
  } catch (error) {
    next(error);
  }
};

// Delete a patient calendar
exports.delete = async (req, res) => {
  const { id } = req.params;
  try {
    const patientCalendar = await PatientCalendar.findByIdAndDelete(id);
    if (!patientCalendar) return next(new AppError('No patient calendar found with that ID', 404));
    res.status(200).json({ success: true, data: patientCalendar });
  } catch (error) {
    next(error);
  }
};