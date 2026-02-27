# Patient Calendar API

## Endpoints
### Get All Patient Calendars
- **Endpoint**: `/api/patient-calendars`
- **Method**: GET
- **Description**: Retrieve all patient calendars.

### Create a New Patient Calendar
- **Endpoint**: `/api/patient-calendars`
- **Method**: POST
- **Description**: Create a new patient calendar.

### Update an Existing Patient Calendar
- **Endpoint**: `/api/patient-calendars/{id}`
- **Method**: PUT
- **Description**: Update an existing patient calendar.

### Delete a Patient Calendar
- **Endpoint**: `/api/patient-calendars/{id}`
- **Method**: DELETE
- **Description**: Delete a patient calendar.

## Environment Variables
- `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`: JWT secret for authentication