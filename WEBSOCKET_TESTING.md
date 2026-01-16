# Testing WebSockets with Postman

## Prerequisites
1. **Postman v8.5.0 or newer** (supports WebSockets)
2. **Server running**: `npm run dev`
3. **JWT tokens**: Get from login endpoints first

## Setup

### 1. Import the Collection
- In Postman, click **Import**
- Select `postman/websocket-tests.postman_collection.json`

### 2. Get JWT Tokens

Use your existing HTTP collection to login:

**Driver Login:**
```
POST http://localhost:3000/api/v1/auth/login
{
  "email": "driver@example.com",  
  "password": "your-password"
}
```
Copy the `accessToken` and set as `driverToken` variable in Postman.

**Passenger Login:**
```
POST http://localhost:3000/api/v1/auth/login
{
  "email": "passenger@example.com",
  "password": "your-password"
}
```
Copy the `accessToken` and set as `passengerToken` variable.

### 3. Set Collection Variables
- Click on the WebSocket collection
- Go to **Variables** tab
- Set `driverToken` = (your driver JWT)
- Set `passengerToken` = (your passenger JWT)

## Testing

### Connect as Driver
1. Open "WebSocket - Driver Connection" request
2. Click **Connect**
3. You should see: `User connected: driver-123 (DRIVER)` in server logs
4. You'll receive `ride:created` events when rides are created

### Connect as Passenger  
1. Open "WebSocket - Passenger Connection" request
2. Click **Connect**
3. You should see: `User connected: passenger-123 (USER)` in server logs
4. You'll receive `ride:statusUpdated` events for your rides

## Sending Events

Once connected, send JSON messages in the message panel:

### Update Ride Status
```json
["ride:updateStatus", {
  "rideId": "your-ride-id-here",
  "status": "ONGOING"
}]
```

### Join a Ride Room
```json
["ride:join", {
  "rideId": "your-ride-id-here"
}]
```

## Events You'll Receive

### Driver Events
- `ride:created` - New ride available
  ```json
  ["ride:created", { "ride": {...} }]
  ```
- `heartbeat` - Every 30 seconds
  ```json
  ["heartbeat", { "timestamp": 1234567890 }]
  ```

### Passenger Events
- `ride:accepted` - Driver accepted your ride
  ```json
  ["ride:accepted", { "ride": {...} }]
  ```
- `ride:statusUpdated` - Status changed
  ```json
  ["ride:statusUpdated", { "ride": {...} }]
  ```
- `ride:cancelled` - Ride cancelled
  ```json
  ["ride:cancelled", { "ride": {...}, "reason": "..." }]
  ```

## Testing Flow

1. **Connect** both driver and passenger WebSockets
2. **Create a ride** via HTTP POST (use existing Postman request)
3. **Driver receives** `ride:created` event
4. **Accept ride** via HTTP POST  
5. **Passenger receives** `ride:accepted` event
6. **Update status** via WebSocket: `ride:updateStatus`
7. **Both receive** `ride:statusUpdated` event

## Troubleshooting

- **Connection Error**: Check token is valid (not expired)
- **No Events**: Make sure you're in the right room (driver vs passenger)
- **401 Error**: Token might be malformed or missing 'Bearer' prefix
