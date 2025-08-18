# Exchange API Server

Authentication and User Management API for the Trading Exchange system.

## 🚀 Features

### Phase 1: Authentication & User Management ✅

- [x] User registration and login
- [x] JWT authentication with refresh tokens
- [x] Password hashing with bcrypt
- [x] Email verification system
- [x] Account status management
- [x] Security middleware (helmet, cors, rate limiting)

### Phase 2: Account & Balance Management (Coming Soon)

- [ ] Balance management endpoints
- [ ] Deposit/withdrawal simulation
- [ ] Transaction history
- [ ] Account statements

### Phase 3: Security & Limits (Coming Soon)

- [ ] Enhanced rate limiting
- [ ] API key management
- [ ] Advanced validation
- [ ] Audit logging

### Phase 4: Historical Data (Coming Soon)

- [ ] Trade analytics
- [ ] Market data aggregation
- [ ] Reporting endpoints

## 🏗️ Architecture

This API server works in conjunction with:

- **Orderbook Server** (Port 3000) - Trading engine
- **PostgreSQL** - User data and transactions
- **Redis** - Session management and caching
- **Next.js Frontend** (Port 3000) - With NextAuth integration

## 🚦 Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)

### Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd exchange

# Start all services with Docker Compose
docker-compose up --build

# The API server will be available at:
# http://localhost:4000
```

### Local Development

```bash
cd api-server

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Start development server
npm run dev
```

## 📚 API Documentation

### Base URL

```
http://localhost:4000/api/v1
```

### Authentication Endpoints

#### Register User

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "username": "johndoe"
}
```

#### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

#### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "your-refresh-token"
}
```

### User Endpoints

#### Get Profile

```http
GET /user/profile
Authorization: Bearer <access-token>
```

#### Update Profile

```http
PUT /user/profile
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith"
}
```

### Balance Endpoints

#### Get Balances

```http
GET /balance
Authorization: Bearer <access-token>
```

#### Get Balance by Asset

```http
GET /balance/BTC
Authorization: Bearer <access-token>
```

### Order Endpoints

#### Submit Order

```http
POST /order
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "tradingPair": "BTCUSD",
  "side": "BUY",
  "orderType": "LIMIT",
  "quantity": 0.1,
  "price": 45000
}
```

#### Get Order History

```http
GET /order/history?page=1&limit=20
Authorization: Bearer <access-token>
```

## 🔧 Configuration

### Environment Variables

```env
# Server
NODE_ENV=development
PORT=4000

# Database
DATABASE_URL="postgresql://exchange_user:exchange_pass@postgres:5432/exchange_db"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="24h"
JWT_REFRESH_EXPIRES_IN="7d"

# Redis
REDIS_URL="redis://redis:6379"

# Security
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGIN="http://localhost:3000"

# External Services
ORDERBOOK_SERVICE_URL="http://orderbook-server:3000"
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📊 Health Checks

### API Health

```http
GET /health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  },
  "version": "1.0.0"
}
```

## 🔒 Security Features

- **Helmet** - Security headers
- **CORS** - Cross-origin request handling
- **Rate Limiting** - API request throttling
- **JWT Authentication** - Secure token-based auth
- **Password Hashing** - bcrypt with salt rounds
- **Input Validation** - Joi schema validation
- **Error Handling** - Comprehensive error responses

## 🚀 Deployment

### Docker Production Build

```bash
# Build production image
docker build -t exchange-api-server .

# Run with production environment
docker run -p 4000:4000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="your-prod-db-url" \
  -e REDIS_URL="your-prod-redis-url" \
  exchange-api-server
```

### Environment-specific Configs

- **Development**: Full logging, CORS enabled
- **Production**: Minimal logging, secure headers
- **Testing**: In-memory database, mock services

## 📈 Monitoring

### Logs

- **Error logs**: `logs/error.log`
- **Combined logs**: `logs/combined.log`
- **Console output**: Development only

### Metrics

- Request count per endpoint
- Response times
- Error rates
- Authentication success/failure rates

## 🤝 Integration with Frontend (Next.js + NextAuth)

This API server is designed to work with NextAuth in your Next.js frontend:

```javascript
// pages/api/auth/[...nextauth].js
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export default NextAuth({
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const res = await fetch("http://api-server:4000/api/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });

        const data = await res.json();

        if (res.ok && data.user) {
          return data.user;
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      return session;
    },
  },
});
```

## 🔄 Service Communication

The API server communicates with other services:

- **Orderbook Server**: HTTP requests for trade operations
- **Redis**: Session storage and real-time data
- **PostgreSQL**: User data persistence
- **Frontend**: REST API and WebSocket connections

## 📝 Development Roadmap

1. **Phase 1**: ✅ Basic auth and user management
2. **Phase 2**: Balance and transaction management
3. **Phase 3**: Advanced security and rate limiting
4. **Phase 4**: Analytics and reporting
5. **Phase 5**: Admin panel and monitoring

## 🆘 Troubleshooting

### Common Issues

1. **Database Connection Failed**

   - Check PostgreSQL container is running
   - Verify DATABASE_URL is correct
   - Run database migrations

2. **Redis Connection Failed**

   - Check Redis container is running
   - Verify REDIS_URL is correct

3. **JWT Token Issues**

   - Ensure JWT_SECRET is set
   - Check token expiration settings
   - Verify token format in requests

4. **CORS Errors**
   - Check CORS_ORIGIN environment variable
   - Ensure frontend URL matches CORS config

### Logs Location

- Container logs: `docker-compose logs api-server`
- Application logs: `logs/` directory

## 📄 License

This project is licensed under the ISC License.
