# WebSocket API Reference

Comprehensive documentation for all real-time communication in the VTC Sahra system.

---

## 🚀 1. Connection & Authentication

### Connection Details
- **Endpoint**: `https://api.vtc-sahra.com` (Production) or `http://localhost:3000` (Local)
- **Protocol**: Socket.IO (v4+)
- **Transport**: `websocket` (Required)

### Authentication Flow
1. **Connect** with your JWT token in the auth header.
2. **Authenticate Event**: Immediately after connecting, you MUST emit the `authenticate` event.

```dart
// Flutter Example
socket = IO.io(URL, IO.OptionBuilder()
  .setTransports(['websocket'])
  .setAuth({'token': 'Bearer $jwtToken'})
  .build()
);

socket.onConnect((_) {
  socket.emit('authenticate', {
    'userId': 'user-123',
    'role': 'DRIVER' // or 'USER'
  });
});
```

---

## 🏎️ 2. Location Tracking

### A. Driver Availability (For matching)
Drivers who are "Available" should send their location every 30 seconds to receive nearby ride notifications.

- **Event**: `driver:locationUpdate` (Client → Server)
- **Payload**:
  ```json
  {
    "latitude": 36.7538,
    "longitude": 3.0588
  }
  ```
- **Behavior**: Used to filter `ride:created` events. Cleared after 5 minutes of inactivity or on disconnect.

### B. Live Ride Tracking (During active ride)
Once a ride is `ACCEPTED` or `ONGOING`, the driver sends high-frequency updates (every 2-3s).

- **Event**: `location:update` (Client → Server)
- **Payload**:
  ```json
  {
    "rideId": "ride-123",
    "latitude": 36.7538,
    "longitude": 3.0588,
    "heading": 90,    // Optional (0-360)
    "speed": 45,      // Optional (km/h)
    "accuracy": 10    // Optional (meters)
  }
  ```
- **Event**: `location:updated` (Server → Passenger)
- **Payload**: Same as above + `timestamp`.

---

## 🚖 3. Ride Events

### Server → Client (Listen)

| Event | Who Gets It | Description |
| :--- | :--- | :--- |
| `ride:created` | **Nearby Drivers** | New ride within 10km. Includes `distance` and `estimatedArrival`. |
| `ride:accepted` | **Passenger** | Driver accepted. Includes `driver` and `vehicle` details. |
| `ride:driverCancelled` | **Passenger** | Driver cancelled an **ACCEPTED** ride. Ride returns to PENDING. |
| `ride:statusUpdated` | **Both** | Ride moved to `ONGOING` (Started) or `COMPLETED`. |
| `ride:cancelled` | **Both** | Ride fully cancelled (by passenger or by driver during ONGOING). |
| `ride:error` | **Sender** | Error message if a command fails. |

### Client → Server (Emit)

| Event | Who Sends | Description |
| :--- | :--- | :--- |
| `authenticate` | Both | Establishment of identity. |
| `ride:updateStatus` | Driver | Change status to `ONGOING` or `COMPLETED`. |

---

## 📋 4. Event Data Formats

### `ride:created` (For Drivers)
```json
{
  "ride": { "id": "...", "originLat": 36.7, ... },
  "distance": 1.25,        // km from your current location
  "estimatedArrival": 4   // minutes to pickup
}
```

### `location:updated` (For Passengers)
```json
{
  "driverId": "...",
  "latitude": 36.7538,
  "longitude": 3.0588,
  "heading": 120,
  "timestamp": "2026-02-03T..."
}
```

---

## ⚠️ 5. Error Codes

| Code | Meaning |
| :--- | :--- |
| `UNAUTHORIZED` | User not authenticated or wrong role. |
| `INVALID_LOCATION` | Coordinates out of bounds. |
| `RIDE_NOT_FOUND` | The specified ride ID does not exist. |
| `INVALID_RIDE_STATUS` | Tracking attempted on a completed/cancelled ride. |
| `RATE_LIMIT` | Too many updates (max 1 update per 2s for live tracking). |

---

## 🧪 6. Testing

### CLI Test Tool
```bash
# Test as a driver
npm run ws-test <DRIVER_JWT>

# Available commands in test CLI:
# location <lat> <lng>
# status <rideId> <status>
```

### Manual Verification
1. Open Driver App -> Set status to Available -> Emit `driver:locationUpdate`.
2. Open Passenger App -> Create Ride.
3. Driver should receive `ride:created` with distance.
4. Driver Accepts -> Passenger receives `ride:accepted`.
5. Driver moves -> Passenger receives `location:updated` every few seconds.

---

**Version**: 1.1.0  
**Last Updated**: February 2026
