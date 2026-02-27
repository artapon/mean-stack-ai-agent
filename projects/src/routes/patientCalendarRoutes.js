// src/routes/patientCalendarRoutes.js
const express = require('express');
const router = express.Router();
const patientCalendarController = require('../controllers/patientCalendarController');

// Get all patient calendars
router.get('/', patientCalendarController.getAll);

// Create a new patient calendar
router.post('/', patientCalendarController.create);

// Update an existing patient calendar
router.put('/:id', patientCalendarController.update);

// Delete a patient calendar
router.delete('/:id', patientCalendarController.delete);

module.exports = router;