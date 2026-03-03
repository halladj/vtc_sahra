# Rating System & Admin Routes — API Reference

Documentation for the rating system and all admin-protected routes in the VTC Sahra API.

---

## 🔐 Authentication & Role Guards

All endpoints require a valid JWT Bearer token. Admin endpoints additionally require `Role.ADMIN`.

```http
Authorization: Bearer <jwt_access_token>
```

Two middleware guards are stacked for admin routes:

```
isAuthenticated  →  requireRole(ADMIN)  →  handler
```

Non-admin access returns `403 Forbidden`.

---

## ⭐ 1. Rating System

### Overview

- Only **passengers** can rate a ride
- Ratings are tied to a **completed** ride
- One rating per ride — cannot be changed after submission
- Score: **1–5** (integers or decimals)
- Comment: optional, max **500 characters**

### Endpoints

#### `POST /api/ratings` — Submit a Rating

> **Auth**: Any authenticated user (must be the passenger of the ride)

**Request Body**
```json
{
  "rideId": "ride-abc123",
  "score": 5,
  "comment": "Very smooth ride, on time!"
}
```

**Success Response** — `201 Created`
```json
{
  "id": "rating-xyz",
  "rideId": "ride-abc123",
  "fromId": "passenger-123",
  "toId": "driver-456",
  "score": 5,
  "comment": "Very smooth ride, on time!",
  "ride": { "id": "...", "originLat": 36.7, "originLng": 3.0, ... },
  "from": { "id": "...", "firstName": "Alice", "lastName": "D." },
  "to":   { "id": "...", "firstName": "Karim", "lastName": "B." }
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `400` | Missing `rideId` or `score` |
| `400` | Score not between 1 and 5 |
| `400` | Comment exceeds 500 characters |
| `401` | Not authenticated |
| `403` | User is not the passenger of this ride |
| `403` | Ride status is not `COMPLETED` |
| `404` | Ride not found |
| `404` | Ride has no assigned driver |
| `409` | Ride has already been rated |

---

#### `GET /api/ratings/ride/:rideId` — Get Rating for a Ride

> **Auth**: Passenger or driver of the ride only

**Success Response** — `200 OK`
```json
{
  "id": "rating-xyz",
  "rideId": "ride-abc123",
  "score": 5,
  "comment": "Very smooth ride, on time!",
  "from": { "id": "...", "firstName": "Alice", "lastName": "D." },
  "to":   { "id": "...", "firstName": "Karim", "lastName": "B." }
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `403` | Caller is not involved in this ride |
| `404` | Ride not found |
| `404` | No rating exists for this ride yet |

---

#### `GET /api/ratings/driver/:driverId` — Get All Ratings for a Driver

> **Auth**: Any authenticated user

Returns all ratings received by a driver, ordered newest first.

**Success Response** — `200 OK`
```json
[
  {
    "id": "rating-1",
    "score": 5,
    "comment": "Excellent!",
    "ride": { "id": "...", "createdAt": "..." },
    "from": { "id": "...", "firstName": "Alice", "lastName": "D." }
  }
]
```

Returns `[]` if the driver has no ratings yet.

---

#### `GET /api/ratings/driver/:driverId/average` — Get Driver's Average Rating

> **Auth**: Any authenticated user

**Success Response** — `200 OK`
```json
{
  "average": 4.7,
  "count": 23
}
```

Returns `{ "average": 0, "count": 0 }` if the driver has no ratings.

> **Note**: Average is rounded to 1 decimal place.

---

## 🔑 2. Admin Routes

### 2a. Admin Account Creation

#### `POST /api/auth/register-admin` — Create a New Admin

> **Auth**: `ADMIN` only — only an existing admin can create another admin

**Request Body**
```json
{
  "email": "newadmin@vtc.dz",
  "password": "SecurePass123!",
  "phoneNumber": "+213555999999",
  "firstName": "Nour",
  "lastName": "Benali"
}
```

**Success Response** — `201 Created`
```json
{
  "message": "Admin account created successfully",
  "admin": {
    "id": "admin-xyz",
    "email": "newadmin@vtc.dz",
    "firstName": "Nour",
    "lastName": "Benali",
    "role": "ADMIN"
  },
  "accessToken": "...",
  "refreshToken": "..."
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `400` | Missing email or password |
| `400` | Email already in use |
| `401` | Not authenticated |
| `403` | Caller is not an admin |

---

### 2b. Gift Card Management

#### `POST /api/giftcards` — Create a Gift Card

> **Auth**: `ADMIN` only

**Request Body**
```json
{
  "amount": 5000,
  "code": "PROMO-EID25"
}
```

> `code` is optional — if omitted, a unique code (`GIFT-XXXXXXXX`) is auto-generated.

**Success Response** — `201 Created`
```json
{
  "id": "gc-xyz",
  "code": "PROMO-EID25",
  "amount": 5000,
  "isUsed": false,
  "usedBy": null,
  "usedAt": null
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `400` | Missing or non-numeric `amount` |
| `400` | Amount is zero or negative |
| `403` | Not an admin |
| `409` | Gift card code already exists |

---

#### `GET /api/giftcards` — List All Gift Cards

> **Auth**: `ADMIN` only

Returns all gift cards, unused ones first.

**Success Response** — `200 OK`
```json
[
  { "id": "gc-1", "code": "PROMO-EID25", "amount": 5000, "isUsed": false },
  { "id": "gc-2", "code": "GIFT-ABCD1234", "amount": 2000, "isUsed": true, "usedBy": "user-123", "usedAt": "..." }
]
```

---

#### `GET /api/giftcards/:code` — Look Up a Gift Card by Code

> **Auth**: `ADMIN` only

**Success Response** — `200 OK`
```json
{
  "id": "gc-1",
  "code": "PROMO-EID25",
  "amount": 5000,
  "isUsed": false
}
```

| Status | Condition |
|--------|-----------|
| `404` | No gift card with this code |

---

#### `POST /api/giftcards/redeem` — Redeem a Gift Card *(User Route)*

> **Auth**: Any authenticated user

**Request Body**
```json
{
  "code": "PROMO-EID25"
}
```

**Success Response** — `200 OK`
```json
{
  "message": "Gift card redeemed successfully",
  "giftCard": {
    "code": "PROMO-EID25",
    "amount": 5000,
    "usedAt": "2026-03-03T14:00:00.000Z"
  },
  "wallet": {
    "balance": 12000
  },
  "transaction": { "id": "tx-xyz", "amount": 5000, "type": "CREDIT" }
}
```

| Status | Condition |
|--------|-----------|
| `400` | Missing `code` |
| `400` | Gift card not found |
| `400` | Gift card already used |

---

### 2c. Wallet Management (Admin)

#### `POST /api/wallet/credit` — Credit a User's Wallet

> **Auth**: `ADMIN` only

**Request Body**
```json
{
  "userId": "user-abc123",
  "amount": 10000,
  "reference": "Promotional credit — March 2026"
}
```

> `reference` is optional.

**Success Response** — `200 OK`
```json
{
  "wallet": {
    "id": "wallet-xyz",
    "userId": "user-abc123",
    "balance": 15000
  },
  "transaction": {
    "id": "tx-abc",
    "type": "CREDIT",
    "amount": 10000,
    "reference": "Promotional credit — March 2026",
    "createdAt": "..."
  }
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `400` | Missing `userId` or `amount` |
| `400` | Amount is zero or negative |
| `403` | Not an admin |

---

#### `POST /api/wallet/debit` — Debit a User's Wallet

> **Auth**: `ADMIN` only

**Request Body**
```json
{
  "userId": "user-abc123",
  "amount": 2000,
  "reference": "Manual correction"
}
```

**Success Response** — `200 OK`
```json
{
  "wallet": {
    "id": "wallet-xyz",
    "userId": "user-abc123",
    "balance": 13000
  },
  "transaction": {
    "id": "tx-def",
    "type": "DEBIT",
    "amount": 2000,
    "reference": "Manual correction",
    "createdAt": "..."
  }
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `400` | Missing `userId` or `amount` |
| `400` | Amount is zero or negative |
| `400` | Insufficient wallet balance |
| `403` | Not an admin |

---

## 📊 3. Route Summary

### Rating System

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/ratings` | User (passenger only) | Submit a rating |
| `GET` | `/api/ratings/ride/:rideId` | User (must be in ride) | Get rating for a ride |
| `GET` | `/api/ratings/driver/:driverId` | Any auth user | Get all driver ratings |
| `GET` | `/api/ratings/driver/:driverId/average` | Any auth user | Get driver average |

### Admin Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register-admin` | ADMIN | Create a new admin account |
| `POST` | `/api/giftcards` | ADMIN | Create a gift card |
| `GET` | `/api/giftcards` | ADMIN | List all gift cards |
| `GET` | `/api/giftcards/:code` | ADMIN | Get gift card by code |
| `POST` | `/api/giftcards/redeem` | Any auth user | Redeem a gift card |
| `POST` | `/api/wallet/credit` | ADMIN | Credit a user's wallet |
| `POST` | `/api/wallet/debit` | ADMIN | Debit a user's wallet |

---

## 🧪 4. Test Coverage

All routes above are covered by automated tests (Jest + Supertest) with mocked databases.

```bash
# Run all relevant tests
npx jest --testPathPatterns="rating|giftcard|wallet|auth|middleware"

# Run with coverage report
npx jest --testPathPatterns="rating|giftcard|wallet|auth|middleware" --coverage
```

### Coverage Targets (enforced in `jest.config.js`)

| Module | Branches | Functions | Lines |
|--------|----------|-----------|-------|
| `rating.services.ts` | ≥ 90% | 100% | ≥ 90% |
| `rating.route.ts` | ≥ 85% | 100% | ≥ 85% |
| `wallet.services.ts` | ≥ 85% | 100% | ≥ 85% |
| `giftcard.services.ts` | ≥ 85% | 100% | ≥ 85% |
| `middlewares.ts` | ≥ 80% | ≥ 75% | ≥ 90% |

---

**Version**: 1.0.0  
**Last Updated**: March 2026
