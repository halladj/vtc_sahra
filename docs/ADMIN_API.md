# Admin API Reference — VTC Sahra

Documentation for all admin-protected routes in the VTC Sahra API.

---

## 🔐 Authentication & Role Guards

All admin endpoints require a valid JWT Bearer token **and** the `Role.ADMIN` role.

```http
Authorization: Bearer <jwt_access_token>
```

Two middleware guards are stacked on every admin route:

```
isAuthenticated  →  requireRole(ADMIN)  →  handler
```

Non-admin access returns `403 Forbidden`.

---

## 👤 1. Account Management

### 1a. Create Admin Account

#### `POST /api/auth/register-admin` — Create a New Admin

> **Auth**: `ADMIN` only — only an existing admin can create another admin

> **Content-Type**: `multipart/form-data` (supports optional photo upload)

**Request Body**
```json
{
  "email": "newadmin@vtc.dz",
  "password": "SecurePass123!",
  "phoneNumber": "+213555999999",
  "firstName": "Nour",
  "lastName": "Benali",
  "sex": "MALE",
  "dateOfBirth": "1990-01-15",
  "address": "Rue Didouche Mourad",
  "wilaya": "Alger",
  "commune": "Hussein Dey"
}
```

> `sex`, `dateOfBirth`, `address`, `wilaya`, `commune`, and `photo` are optional.

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
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `400` | Missing `email` or `password` |
| `400` | Email already in use |
| `401` | Not authenticated |
| `403` | Caller is not an admin |

---

### 1b. Register a Driver

#### `POST /api/auth/register-driver` — Create a Driver Account

> **Auth**: Public — but intended for admin-managed onboarding flows

> **Content-Type**: `multipart/form-data` (supports optional photo upload)

**Request Body**
```json
{
  "email": "driver@vtc.dz",
  "password": "SecurePass123!",
  "phoneNumber": "+213555000001",
  "firstName": "Karim",
  "lastName": "Bensaid",
  "sex": "MALE",
  "dateOfBirth": "1988-05-20",
  "address": "Cité des Pins",
  "wilaya": "Annaba",
  "commune": "El Bouni",
  "vehicle": {
    "type": "CAR",
    "model": "Peugeot 208",
    "year": 2021,
    "plate": "12345-16-001"
  }
}
```

> `sex`, `dateOfBirth`, `address`, `wilaya`, `commune`, and `photo` are optional.  
> `vehicle` is required. Vehicle `type` must be one of: `CAR`, `VAN`, `TRUCK`, `MOTORCYCLE`.

**Success Response** — `200 OK`
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `400` | Missing `email` or `password` |
| `400` | Missing `vehicle` object |
| `400` | Email already in use |

---

## 🎁 2. Gift Card Management

### `POST /api/giftcards` — Create a Gift Card

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

### `GET /api/giftcards` — List All Gift Cards

> **Auth**: `ADMIN` only

Returns all gift cards, unused ones listed first.

**Success Response** — `200 OK`
```json
[
  { "id": "gc-1", "code": "PROMO-EID25", "amount": 5000, "isUsed": false },
  { "id": "gc-2", "code": "GIFT-ABCD1234", "amount": 2000, "isUsed": true, "usedBy": "user-123", "usedAt": "2026-03-01T12:00:00.000Z" }
]
```

---

### `GET /api/giftcards/:code` — Look Up a Gift Card by Code

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

### 2d. Gift Card Redemption (User Route)

#### `POST /api/giftcards/redeem` — Redeem a Gift Card

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
  "transaction": { 
    "id": "tx-xyz", 
    "type": "CREDIT",
    "amount": 5000, 
    "createdAt": "..."
  }
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `400` | Missing `code` |
| `400` | Gift card not found |
| `400` | Gift card already used |

---

## 💰 3. Wallet Management

### `POST /api/wallet/credit` — Credit a User's Wallet

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
    "createdAt": "2026-03-06T13:00:00.000Z"
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

### `POST /api/wallet/debit` — Debit a User's Wallet

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
    "createdAt": "2026-03-06T13:05:00.000Z"
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

## 📊 4. Route Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register-admin` | `ADMIN` | Create a new admin account |
| `POST` | `/api/auth/register-driver` | Public | Register a driver account |
| `POST` | `/api/giftcards` | `ADMIN` | Create a gift card |
| `GET` | `/api/giftcards` | `ADMIN` | List all gift cards |
| `GET` | `/api/giftcards/:code` | `ADMIN` | Get gift card by code |
| `POST` | `/api/wallet/credit` | `ADMIN` | Credit a user's wallet |
| `POST` | `/api/wallet/debit` | `ADMIN` | Debit a user's wallet |

### User-Accessible Routes (Gift Cards)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/giftcards/redeem` | Any auth user | Redeem a gift card |

---

## 🧪 5. Test Coverage

Admin-related routes are covered by automated tests (Jest + Supertest) with mocked databases.

```bash
# Run all relevant tests
npx jest --testPathPatterns="giftcard|wallet|auth|middleware"

# Run with coverage report
npx jest --testPathPatterns="giftcard|wallet|auth|middleware" --coverage
```

---

**Version**: 1.0.0  
**Last Updated**: March 2026
