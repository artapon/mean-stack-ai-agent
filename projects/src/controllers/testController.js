// src/controllers/testController.js

const express = require('express');
const router = express.Router();

// Sample test endpoint
router.get('/test', (req, res) => {
  return res.status(200).json({ message: 'Hello from test controller!' });
});

module.exports = router;