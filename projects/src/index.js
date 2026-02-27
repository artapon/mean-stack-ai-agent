// src/index.js
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const patientCalendarRoutes = require('./routes/patientCalendarRoutes');

// Middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(limiter);

// Routes
app.use('/api/patient-calendars', patientCalendarRoutes);

// Error Handler
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
};
app.use(errorHandler);

// Start the server
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  autoCreate: true,
}).then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch((error) => {
  console.error('Failed to connect to MongoDB:', error);
});