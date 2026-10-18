# Deployment Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- PM2 (recommended for production)

## Backend Setup

1. Copy environment variables:

```bash
cd backend
cp .env.example .env
# Edit .env with your production values
```

2. Install dependencies:

```bash
npm install
```

3. Set up the database:

```bash
# Create the database and run schema migrations
# Ensure `unique_confirmed_seat` partial unique index exists on bookings(seat_id) WHERE status = 'confirmed'
```

4. Start with PM2:

```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

Or directly:

```bash
NODE_ENV=production npm start
```

## Frontend Setup

1. Copy environment variables:

```bash
cd frontend
cp .env.example .env.local
# Edit NEXT_PUBLIC_API_URL to point to your production backend
```

2. Install dependencies:

```bash
npm install
```

3. Build for production:

```bash
npm run build
```

4. Start:

```bash
npm start
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 5000 |
| `NODE_ENV` | Environment | production |
| `DB_USER` | PostgreSQL user | postgres |
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_NAME` | Database name | seat_booking_db |
| `DB_PASSWORD` | Database password | - |
| `DB_PORT` | PostgreSQL port | 5432 |
| `JWT_SECRET` | JWT signing secret | - (change in production) |
| `JWT_EXPIRES_IN` | Token expiry | 1d |
| `BCRYPT_SALT_ROUNDS` | Password hash cost | 10 |
| `CORS_ORIGIN` | Allowed CORS origin | http://localhost:3000 |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL |

## Security Notes

- Change `JWT_SECRET` to a strong random value in production
- Set `CORS_ORIGIN` to your actual frontend domain
- Use HTTPS in production
- Ensure `DB_PASSWORD` is strong
