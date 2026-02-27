// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const registeredUser = await userController.register(name, email, password);
    res.status(201).json({ success: true, data: registeredUser });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// Login user and get JWT token
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const loggedInUser = await userController.login(email, password);
    res.status(200).json({ success: true, data: loggedInUser });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// Get logged in user's profile
const verifyToken = require('../middleware/verifyToken');
router.get('/profile', verifyToken, authMiddleware.protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const userProfile = await userController.getProfile(userId);
    res.status(200).json({ success: true, data: userProfile });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

module.exports = router;