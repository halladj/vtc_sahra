# WebSocket API Reference

Real-time ride updates via Socket.IO.

## Quick Start

**Connect:**
```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

socket = IO.io('http://your-server:3000', 
  IO.OptionBuilder()
    .setAuth({'token': 'Bearer $jwtToken'})
    .setTransports(['websocket'])
    .build()
);
```

**Listen for events:**
```dart
socket.on('ride:created', (data) => handleNewRide(data['ride']));
socket.on('ride:accepted', (data) => handleRideAccepted(data['ride']));
socket.on('ride:statusUpdated', (data) => handleStatusUpdate(data['ride']));
socket.on('ride:cancelled', (data) => handleCancelled(data['ride']));
```

**Send events:**
```dart
socket.emitWithAck('ride:updateStatus', 
  {'rideId': id, 'status': 'ONGOING'},
  ack: (response) => handleResponse(response)
);
```

---

## Events Reference

### Server → Client

| Event | Who Receives | Data |
|-------|--------------|------|
| `ride:created` | All drivers | `{ride: Ride}` - New ride needs driver |
| `ride:accepted` | Passenger + Driver | `{ride: Ride}` - Driver accepted |
| `ride:statusUpdated` | Passenger + Driver | `{ride: Ride}` - Status changed |
| `ride:cancelled` | Passenger + Driver | `{ride: Ride, reason?: string}` |
| `heartbeat` | All clients | `{timestamp: number}` - Every 30s |

### Client → Server

| Event | Payload | Response |
|-------|---------|----------|
| `ride:updateStatus` | `{rideId: string, status: string}` | Success: `{success: true, ride: Ride}`<br>Error: `{error: string, code: string}` |
| `ride:join` | `{rideId: string}` | - |
| `heartbeat:response` | - | - |

**Valid Statuses:** `PENDING`, `ACCEPTED`, `ONGOING`, `COMPLETED`, `CANCELLED`

**Rate Limit:** 10 requests/minute

---

## Complete Flutter Example

```dart
class RideSocketService {
  late IO.Socket socket;
  
  void connect(String token) {
    socket = IO.io('http://your-server:3000', 
      IO.OptionBuilder()
        .setAuth({'token': 'Bearer $token'})
        .setTransports(['websocket'])
        .build()
    );
    
    socket.onConnect((_) => print('Connected'));
    socket.on('ride:created', (data) => onNewRide(data['ride']));
    socket.on('ride:accepted', (data) => onAccepted(data['ride']));
    socket.on('ride:statusUpdated', (data) => onUpdate(data['ride']));
    socket.on('ride:cancelled', (data) => onCancelled(data['ride']));
    socket.on('heartbeat', (_) => socket.emit('heartbeat:response'));
  }
  
  void updateStatus(String rideId, String status) {
    socket.emitWithAck('ride:updateStatus',
      {'rideId': rideId, 'status': status},
      ack: (data) {
        if (data['error'] != null) showError(data['error']);
      }
    );
  }
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| `RATE_LIMIT_EXCEEDED` | Too many requests (max 10/min) |
| `INVALID_STATUS` | Invalid status value |
| `INVALID_INPUT` | Missing required fields |

---

## Testing

**CLI:** `npm run ws-test YOUR_JWT_TOKEN`

**Commands:** `update <rideId> <status>`, `join <rideId>`, `help`
