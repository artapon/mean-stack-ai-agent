// src/app.js
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/authRoutes');
const app = express();

app.use(express.json());
app.use(helmet());
app.use(cors());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

app.use('/api', authRoutes);

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ success: false, error: err.message });
};

app.use(errorHandler);

module.exports = app;