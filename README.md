# EcoMon - Secure EcoFlow Monitoring API

A security-first NestJS application for monitoring EcoFlow DELTA Series power stations with encrypted credential storage and comprehensive audit logging.

## Features

### Security Features
- ✅ JWT Authentication (15min access tokens, 7-day refresh tokens)
- ✅ AES-256-GCM encryption for EcoFlow API credentials
- ✅ bcrypt password hashing (12 rounds)
- ✅ Rate limiting (100 requests/60 seconds)
- ✅ Helmet security headers (CSP, HSTS)
- ✅ CORS protection
- ✅ Comprehensive audit logging
- ✅ Device ownership verification

### API Features
- ✅ User registration and authentication
- ✅ Encrypted EcoFlow credential storage
- ✅ Device listing and status monitoring
- ✅ Device command execution
- ✅ Swagger API documentation

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- EcoFlow Developer Account with API credentials from https://developer.ecoflow.com

## Quick Start

### 1. Start PostgreSQL Database

```bash
docker-compose up -d
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

The `.env` file is already configured with:
- Generated JWT secrets
- Generated encryption key
- PostgreSQL connection details
- Security settings

**Important**: Keep the `.env` file secure and never commit it to version control.

### 4. Start the Application

Development mode:
```bash
npm run start:dev
```

Production mode:
```bash
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3030`

## API Documentation

Access the interactive Swagger documentation at:
```
http://localhost:3030/api
```

## API Usage Flow

### 1. Register a User

```bash
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!@#"
}
```

Password requirements:
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### 2. Login

```bash
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!@#"
}
```

Response:
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "a1b2c3d4...",
  "expiresIn": 900
}
```

### 3. Store EcoFlow Credentials (Encrypted)

```bash
POST /ecoflow/credentials
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "accessKey": "YOUR_ECOFLOW_ACCESS_KEY",
  "secretKey": "YOUR_ECOFLOW_SECRET_KEY",
  "label": "My EcoFlow Account"
}
```

**Security Note**: Your EcoFlow credentials are encrypted using AES-256-GCM before being stored in the database.

### 4. Get Your Devices

```bash
GET /ecoflow/devices
Authorization: Bearer {accessToken}
```

### 5. Get Device Status

```bash
GET /ecoflow/devices/{deviceSn}/status
Authorization: Bearer {accessToken}
```

### 6. Send Device Command

```bash
POST /ecoflow/devices/{deviceSn}/command
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "deviceSn": "HW52...",
  "params": {
    "cmdCode": "WN511_SET_BAT_LOWER_PACK",
    "params": {
      "lowerSoc": 20
    }
  }
}
```

## Security Best Practices

1. **Access Control**: Only you can access your EcoFlow devices. The system verifies device ownership before allowing any operations.

2. **Audit Trail**: All security-relevant actions are logged.

3. **Credential Rotation**: You can delete and update your EcoFlow credentials at any time.

4. **Token Management**:
   - Access tokens expire after 15 minutes
   - Refresh tokens expire after 7 days
   - Logout revokes refresh tokens

## License

MIT
