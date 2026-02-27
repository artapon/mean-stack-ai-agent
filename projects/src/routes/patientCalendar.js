// src/routes/patientCalendar.js
const express = require('express');
const router = express.Router();
const patientCalendarController = require('../controllers/patientCalendarController');

// TODO: Define routes for PatientCalendar
router.get('/', protect, patientCalendarController.getAll);
router.post('/', protect, patientCalendarController.create);
router.put('/:id', protect, patientCalendarController.update);
router.delete('/:id', protect, patientCalendarController.delete);

module.exports = router;