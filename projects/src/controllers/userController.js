// src/controllers/userController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const userServices = require('../services/userService');

// Register a new user
exports.register = async (name, email, password) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await userServices.createUser(name, email, hashedPassword);
  return newUser;
};

// Login user and get JWT token
exports.login = async (email, password) => {
  const user = await userServices.getUserByEmail(email);
  if (!user || !await bcrypt.compare(password, user.password)) {
    throw new AppError('Invalid credentials', 401);
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  return { user, token };
};

// Get logged in user's profile
exports.getProfile = async (userId) => {
  const user = await userServices.getUserById(userId);
  if (!user) throw new AppError('User not found', 404);
  return user;
};