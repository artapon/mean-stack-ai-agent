# Healthcare REST API Implementation

**Objective:**
- Create a full-fledged healthcare REST API with patient CRUD operations, JWT authentication, and Swagger documentation.

**File List:**
- `src/controllers/patientController.js`
- `src/services/patientService.js`
- `src/routes/patientRoutes.js`
- `src/routes/swaggerRoutes.js`
- `src/middleware/authMiddleware.js`
- `src/config/securityConfig.js`

**Endpoints:**
- **GET /patients**: Retrieve all patients.
- **POST /patients**: Create a new patient.
- **GET /patients/:id**: Retrieve a single patient by ID.
- **PUT /patients/:id**: Update an existing patient.
- **DELETE /patients/:id**: Delete a patient.