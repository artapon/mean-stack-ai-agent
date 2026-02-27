// src/services/userService.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// @desc    Get user by ID
// @param   id - The user's ID
// @returns {Promise<User>} - Promise resolving to the user object or null if not found
const getUserById = async (id) => {
  try {
    const user = await User.findById(id);
    return user;
  } catch (error) {
    console.error('Error fetching user:', error);
    throw new Error('Failed to fetch user');
  }
};

// @desc    Update user's password
// @param   id - The user's ID
// @param   newPassword - The new password
// @returns {Promise<User>} - Promise resolving to the updated user object
const updatePassword = async (id, newPassword) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    const user = await User.findByIdAndUpdate(id, { password: hashedPassword }, { new: true, runValidators: true });
    return user;
  } catch (error) {
    console.error('Error updating password:', error);
    throw new Error('Failed to update password');
  }
};

module.exports = { getUserById, updatePassword };