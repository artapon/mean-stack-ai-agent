// Import express
const express = require('express');

// Create express application
const app = express();

// Import middleware
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Apply middleware
app.use(cors());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(helmet());

// Swagger configuration
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Healthcare API',
      version: '1.0.0'
    }
  },
  apis: ['./src/routes/*.js'] // files containing annotations as above
};
const swaggerSpec = swaggerJsdoc(options);

// Initialize routes
const patientRoutes = require('./routes/patientRoutes');

// Define routes
app.use('/api/v1/patients', patientRoutes);

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});