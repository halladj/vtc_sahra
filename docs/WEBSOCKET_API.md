# WebSocket API Documentation

Real-time ride status updates using Socket.IO WebSocket protocol.

## Base URL

```
ws://your-server-url:3000
```

## Authentication

All WebSocket connections require JWT authentication.

### Connection Setup

**Method 1: Handshake Auth (Recommended)**
```javascript
const socket = io('ws://localhost:3000', {
  auth: { token: 'Bearer YOUR_JWT_TOKEN' },
  transports: ['websocket']
});
```

**Method 2: Query Parameter** (for tools like Postman)
```
ws://localhost:3000?token=YOUR_JWT_TOKEN
```

### Flutter/Dart Example
```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

IO.Socket socket = IO.io('http://your-server:3000', 
  IO.OptionBuilder()
    .setAuth({'token': 'Bearer $jwtToken'})
    .setTransports(['websocket'])
    .enableReconnection()
    .setReconnectionDelay(1000)
    .setReconnectionDelayMax(5000)
    .build()
);

socket.onConnect((_) => print('Connected'));
socket.onConnectError((err) => print('Error: $err'));
```

---

## Connection Events

### `connect`
Fired when successfully connected to the server.

```javascript
socket.on('connect', () => {
  console.log('Connected:', socket.id);
});
```

### `connect_error`
Fired when connection fails (e.g., invalid token).

```javascript
socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

### `disconnect`
Fired when disconnected from the server.

```javascript
socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

---

## Client → Server Events

### `ride:updateStatus`

Update the status of a ride.

**Payload:**
```typescript
{
  rideId: string;
  status: 'PENDING' | 'ACCEPTED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
}
```

**Example:**
```javascript
socket.emit('ride:updateStatus', 
  { 
    rideId: 'abc-123', 
    status: 'ONGOING' 
  },
  (acknowledgment) => {
    if (acknowledgment.error) {
      console.error('Error:', acknowledgment.error);
    } else {
      console.log('Success:', acknowledgment.ride);
    }
  }
);
```

**Dart/Flutter:**
```dart
socket.emitWithAck('ride:updateStatus', 
  {'rideId': rideId, 'status': 'ONGOING'},
  ack: (data) {
    if (data['error'] != null) {
      handleError(data['error']);
    } else {
      handleSuccess(data['ride']);
    }
  }
);
```

**Acknowledgment Response:**
```typescript
// Success
{
  success: true;
  ride: Ride;
}

// Error
{
  error: string;
  code: string; // 'RATE_LIMIT_EXCEEDED' | 'INVALID_INPUT' | 'INVALID_STATUS' | 'UPDATE_FAILED'
}
```

**Rate Limit:** 10 requests per minute per user

---

### `ride:join`

Join a specific ride room to receive updates for that ride.

**Payload:**
```typescript
{
  rideId: string;
}
```

**Example:**
```javascript
socket.emit('ride:join', { rideId: 'abc-123' });
```

**Dart/Flutter:**
```dart
socket.emit('ride:join', {'rideId': rideId});
```

---

### `heartbeat:response`

Respond to server heartbeat to keep connection alive.

**Example:**
```javascript
socket.on('heartbeat', () => {
  socket.emit('heartbeat:response');
});
```

---

## Server → Client Events

### `ride:created`

**Audience:** All connected **drivers**

Emitted when a new ride is created and needs a driver.

**Payload:**
```typescript
{
  ride: {
    id: string;
    type: 'REGULAR' | 'DELIVERY' | 'SEAT';
    status: 'PENDING';
    userId: string;
    originLat: number;
    originLng: number;
    destLat: number;
    destLng: number;
    price: number; // in cents
    distanceKm?: number;
    durationMin?: number;
    createdAt: string; // ISO timestamp
    user: {
      id: string;
      firstName: string;
      lastName: string;
      phoneNumber: string;
      photo?: string;
    }
  }
}
```

**Example:**
```javascript
socket.on('ride:created', (data) => {
  console.log('New ride available:', data.ride);
  // Show notification to driver
  showNewRideNotification(data.ride);
});
```

**Dart/Flutter:**
```dart
socket.on('ride:created', (data) {
  final ride = Ride.fromJson(data['ride']);
  showNewRideNotification(ride);
});
```

---

### `ride:accepted`

**Audience:** Ride **passenger** and **driver**

Emitted when a driver accepts a ride.

**Payload:**
```typescript
{
  ride: {
    id: string;
    status: 'ACCEPTED';
    driverId: string;
    vehicleId?: string;
    driver: {
      id: string;
      firstName: string;
      lastName: string;
      phoneNumber: string;
      photo?: string;
    };
    vehicle?: {
      id: string;
      model: string;
      type: 'CAR' | 'MOTORCYCLE' | 'BICYCLE';
      plateNumber: string;
    };
    // ... other ride fields
  }
}
```

**Example:**
```javascript
socket.on('ride:accepted', (data) => {
  console.log('Ride accepted by:', data.ride.driver);
  // Navigate to active ride screen
  navigateToActiveRide(data.ride);
});
```

---

### `ride:statusUpdated`

**Audience:** Ride **passenger** and **driver**

Emitted when ride status changes (ONGOING, COMPLETED, etc.).

**Payload:**
```typescript
{
  ride: {
    id: string;
    status: 'ONGOING' | 'COMPLETED' | 'CANCELLED';
    // ... full ride object
  }
}
```

**Example:**
```javascript
socket.on('ride:statusUpdated', (data) => {
  console.log('Ride status:', data.ride.status);
  
  switch (data.ride.status) {
    case 'ONGOING':
      showInProgressUI(data.ride);
      break;
    case 'COMPLETED':
      showCompletedUI(data.ride);
      break;
  }
});
```

**Dart/Flutter:**
```dart
socket.on('ride:statusUpdated', (data) {
  final ride = Ride.fromJson(data['ride']);
  
  switch (ride.status) {
    case 'ONGOING':
      Navigator.push(context, RideInProgressScreen(ride));
      break;
    case 'COMPLETED':
      showRatingDialog(ride);
      break;
  }
});
```

---

### `ride:cancelled`

**Audience:** Ride **passenger** and **driver**

Emitted when a ride is cancelled.

**Payload:**
```typescript
{
  ride: {
    id: string;
    status: 'CANCELLED';
    // ... full ride object
  };
  reason?: string;
}
```

**Example:**
```javascript
socket.on('ride:cancelled', (data) => {
  console.log('Ride cancelled:', data.reason);
  showCancellationMessage(data.ride, data.reason);
});
```

---

### `heartbeat`

**Audience:** All connected clients

Sent every 30 seconds to keep connection alive.

**Payload:**
```typescript
{
  timestamp: number; // Unix timestamp in milliseconds
}
```

**Example:**
```javascript
socket.on('heartbeat', (data) => {
  console.log('Heartbeat:', new Date(data.timestamp));
  socket.emit('heartbeat:response');
});
```

---

### `ride:error`

**Audience:** Individual client (error occurred)

Emitted when an error occurs processing a client request.

**Payload:**
```typescript
{
  event: string; // Which event caused the error
  message: string;
  code: string; // Error code
}
```

**Example:**
```javascript
socket.on('ride:error', (data) => {
  console.error(`Error in ${data.event}:`, data.message);
  showErrorMessage(data.message);
});
```

---

## Room Architecture

Clients are automatically added to rooms based on their role and actions:

| Room | Members | Purpose |
|------|---------|---------|
| `drivers` | All drivers | Receive new ride notifications |
| `user:{userId}` | Individual user | User-specific events |
| `ride:{rideId}` | Passenger & Driver of specific ride | Ride-specific updates |

**Note:** Room management is automatic - clients don't need to manually join/leave (except `ride:join` for specific rides).

---

## Complete Integration Example (Flutter)

```dart
class RideSocketService {
  late IO.Socket socket;
  
  void connect(String jwtToken) {
    socket = IO.io('http://your-server:3000', 
      IO.OptionBuilder()
        .setAuth({'token': 'Bearer $jwtToken'})
        .setTransports(['websocket'])
        .enableReconnection()
        .build()
    );
    
    _setupListeners();
    socket.connect();
  }
  
  void _setupListeners() {
    // Connection events
    socket.onConnect((_) {
      print('✅ Connected to WebSocket');
    });
    
    socket.onConnectError((err) {
      print('❌ Connection error: $err');
    });
    
    // Ride events
    socket.on('ride:created', (data) {
      final ride = Ride.fromJson(data['ride']);
      _onNewRide(ride);
    });
    
    socket.on('ride:accepted', (data) {
      final ride = Ride.fromJson(data['ride']);
      _onRideAccepted(ride);
    });
    
    socket.on('ride:statusUpdated', (data) {
      final ride = Ride.fromJson(data['ride']);
      _onRideStatusUpdated(ride);
    });
    
    socket.on('ride:cancelled', (data) {
      final ride = Ride.fromJson(data['ride']);
      final reason = data['reason'];
      _onRideCancelled(ride, reason);
    });
    
    socket.on('heartbeat', (data) {
      socket.emit('heartbeat:response');
    });
  }
  
  void updateRideStatus(String rideId, String status) {
    socket.emitWithAck('ride:updateStatus',
      {'rideId': rideId, 'status': status},
      ack: (response) {
        if (response['error'] != null) {
          _handleError(response['error']);
        } else {
          _handleSuccess(response['ride']);
        }
      }
    );
  }
  
  void joinRide(String rideId) {
    socket.emit('ride:join', {'rideId': rideId});
  }
  
  void disconnect() {
    socket.disconnect();
  }
}
```

---

## Error Handling

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `RATE_LIMIT_EXCEEDED` | More than 10 requests/minute | Wait before retrying |
| `INVALID_INPUT` | Missing required fields | Check payload format |
| `INVALID_STATUS` | Invalid status value | Use valid status enum |
| `UPDATE_FAILED` | Database/logic error | Check server logs |

### Reconnection Strategy

```dart
socket = IO.io('http://your-server:3000', 
  IO.OptionBuilder()
    .enableReconnection()
    .setReconnectionDelay(1000)      // Start with 1s delay
    .setReconnectionDelayMax(5000)   // Max 5s delay
    .setReconnectionAttempts(5)      // Try 5 times
    .build()
);
```

---

## Testing

### Using CLI Tool
```bash
npm run ws-test YOUR_JWT_TOKEN
```

### Using Postman
1. Import `postman/websocket-tests.postman_collection.json`
2. Set JWT tokens in collection variables
3. Connect to WebSocket endpoints

---

## Support

For issues or questions, contact the backend team or check:
- `/scripts/README.md` - CLI testing guide
- `/WEBSOCKET_TESTING.md` - Detailed testing instructions
