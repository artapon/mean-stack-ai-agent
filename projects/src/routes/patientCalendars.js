// src/routes/patientCalendars.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const patientCalendarController = require('../controllers/patientCalendarController');

router.get('/', protect, patientCalendarController.getAll);
router.post('/', protect, patientCalendarController.create);
router.put('/:id', protect, patientCalendarController.update);
router.delete('/:id', protect, patientCalendarController.delete);

module.exports = router;