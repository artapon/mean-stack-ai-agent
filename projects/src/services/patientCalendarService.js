// src/services/patientCalendarService.js
const PatientCalendar = require('../models/PatientCalendar');
const AppError = require('../utils/appError');

// Get all patient calendars
exports.getAll = async () => {
  try {
    const patientCalendars = await PatientCalendar.find().lean();
    return patientCalendars;
  } catch (error) {
    throw new Error('Failed to fetch patient calendars');
  }
};

// Create a new patient calendar
exports.create = async (patientCalendarData) => {
  try {
    const patientCalendar = await PatientCalendar.create(patientCalendarData);
    return patientCalendar;
  } catch (error) {
    throw new Error('Failed to create patient calendar');
  }
};

// Update an existing patient calendar
exports.update = async (id, patientCalendarData) => {
  try {
    const patientCalendar = await PatientCalendar.findByIdAndUpdate(id, patientCalendarData, { new: true, runValidators: true });
    if (!patientCalendar) throw new Error('No patient calendar found with that ID');
    return patientCalendar;
  } catch (error) {
    throw new Error('Failed to update patient calendar');
  }
};

// Delete a patient calendar
exports.delete = async (id) => {
  try {
    const patientCalendar = await PatientCalendar.findByIdAndDelete(id);
    if (!patientCalendar) throw new Error('No patient calendar found with that ID');
    return patientCalendar;
  } catch (error) {
    throw new Error('Failed to delete patient calendar');
  }
};