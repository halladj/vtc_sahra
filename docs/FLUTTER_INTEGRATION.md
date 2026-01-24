# Flutter Integration Guide - VTC Sahra

**Quick guide for real-time ride system integration**

---

## 🚀 Quick Setup (3 Steps)

### 1. Add Dependencies

```yaml
# pubspec.yaml
dependencies:
  socket_io_client: ^2.0.0
  http: ^1.1.0
```

### 2. Configure Connection

```dart
// config.dart
class Config {
  static const API_URL = 'https://api.vtc-sahra.com';  // Your backend URL
}
```

### 3. Import Package

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:http/http.dart' as http;
```

---

## 📡 Real-Time Connection

### Simple Connection (Copy & Paste)

```dart
class SocketService {
  IO.Socket? socket;
  
  // Call this ONCE after login
  void connect({
    required String userId,
    required String userRole,  // 'DRIVER' or 'USER'
  }) {
    socket = IO.io(
      Config.API_URL,  // Your backend URL
      IO.OptionBuilder()
        .setTransports(['websocket'])
        .build(),
    );
    
    socket!.onConnect((_) {
      print('✅ Connected to server');
      
      // REQUIRED: Authenticate immediately
      socket!.emit('authenticate', {
        'userId': userId,
        'role': userRole,
      });
    });
    
    socket!.onDisconnect((_) {
      print('❌ Disconnected');
    });
    
    socket!.connect();
  }
  
  void disconnect() {
    socket?.disconnect();
  }
}
```

### When to Connect

```dart
// ✅ CORRECT: Connect after login
void onLoginSuccess(User user) {
  SocketService().connect(
    userId: user.id,
    userRole: user.role,  // 'DRIVER' or 'USER'
  );
}

// ❌ WRONG: Don't connect before login
// ❌ WRONG: Don't connect after accepting ride
```

---

## 🔄 Pattern: HTTP + WebSocket

### The Rule

```
1. Make change → Use HTTP
2. Get notified → Use WebSocket
```

### Examples

**Accept Ride:**
```dart
// 1. Driver sends HTTP request
await http.post('$API_URL/api/ride/$id/accept');

// 2. Passenger receives WebSocket event automatically
socket.on('ride:accepted', (data) { 
  // Update UI
});
```

**Cancel Ride:**
```dart
// 1. Driver sends HTTP request
await http.put('$API_URL/api/ride/$id/cancel');

// 2. Passenger receives WebSocket event automatically
socket.on('ride:driverCancelled', (data) {
  // Show: "Finding another driver..."
});
```

---

## 📱 For Drivers

### Complete Setup

```dart
class DriverService {
  final socket = SocketService().socket;
  
  void setupDriver() {
    // 1. Listen for new rides
    socket!.on('ride:created', (data) {
      final ride = data['ride'];
      final distance = data['distance'];  // km away
      
      showNotification('New ride $distance km away');
    });
    
    // 2. Send your location (every 30 seconds)
    Timer.periodic(Duration(seconds: 30), (_) async {
      final pos = await Geolocator.getCurrentPosition();
      
      socket!.emit('driver:locationUpdate', {
        'latitude': pos.latitude,
        'longitude': pos.longitude,
      });
    });
  }
  
  // Accept ride via HTTP
  Future<void> acceptRide(String rideId, String vehicleId) async {
    await http.post(
      Uri.parse('$API_URL/api/ride/$rideId/accept'),
      headers: {'Authorization': 'Bearer $token'},
      body: jsonEncode({'vehicleId': vehicleId}),
    );
  }
  
  // Send location during active ride (every 3 seconds)
  void sendLiveLocation(String rideId) {
    Timer.periodic(Duration(seconds: 3), (_) async {
      final pos = await Geolocator.getCurrentPosition();
      
      socket!.emit('location:update', {
        'rideId': rideId,
        'latitude': pos.latitude,
        'longitude': pos.longitude,
        'heading': pos.heading,
      });
    });
  }
}
```

---

## 🚖 For Passengers

### Complete Setup

```dart
class PassengerService {
  final socket = SocketService().socket;
  
  void setupPassenger() {
    // 1. Listen for driver acceptance
    socket!.on('ride:accepted', (data) {
      final driver = data['driver'];
      showMessage('${driver['firstName']} is coming!');
    });
    
    // 2. Listen for driver cancellation
    socket!.on('ride:driverCancelled', (data) {
      showMessage(data['message']);  // "Finding another driver..."
    });
    
    // 3. Track driver location
    socket!.on('location:updated', (data) {
      updateDriverMarker(
        lat: data['latitude'],
        lng: data['longitude'],
      );
    });
    
    // 4. Listen for status updates
    socket!.on('ride:statusUpdated', (data) {
      if (data['status'] == 'ONGOING') {
        showMessage('Ride started!');
      }
    });
  }
  
  // Create ride via HTTP
  Future<String> createRide({
    required double pickupLat,
    required double pickupLng,
    required double destLat,
    required double destLng,
  }) async {
    final response = await http.post(
      Uri.parse('$API_URL/api/ride'),
      headers: {'Authorization': 'Bearer $token'},
      body: jsonEncode({
        'type': 'RIDE_HAILING',
        'originLat': pickupLat,
        'originLng': pickupLng,
        'destLat': destLat,
        'destLng': destLng,
      }),
    );
    
    final ride = jsonDecode(response.body);
    return ride['id'];
  }
}
```

---

## 📋 All WebSocket Events

### Events You Receive (Listen)

| Event | Who Gets It | When |
|-------|-------------|------|
| `ride:created` | Drivers | New ride available nearby |
| `ride:accepted` | Passenger | Driver accepted your ride |
| `ride:driverCancelled` | Passenger | Driver cancelled, finding another |
| `ride:cancelled` | Both | Ride fully cancelled |
| `ride:statusUpdated` | Both | Ride started/completed |
| `location:updated` | Passenger | Driver location update |

### Events You Send (Emit)

| Event | Who Sends | Data |
|-------|-----------|------|
| `authenticate` | Both | `{userId, role}` |
| `driver:locationUpdate` | Driver | `{latitude, longitude}` |
| `location:update` | Driver | `{rideId, latitude, longitude, heading}` |

---

## 🔗 All HTTP Endpoints

### Create Ride (Passenger)
```dart
POST /api/ride
Body: {
  "type": "RIDE_HAILING",
  "originLat": 36.7538,
  "originLng": 3.0588,
  "destLat": 36.7528,
  "destLng": 3.0428
}
```

### Accept Ride (Driver)
```dart
POST /api/ride/:rideId/accept
Body: {"vehicleId": "vehicle-123"}
```

### Update Status (Driver)
```dart
PUT /api/ride/:rideId/status
Body: {"status": "ONGOING"}  // or "COMPLETED"
```

### Cancel Ride (Both)
```dart
PUT /api/ride/:rideId/cancel
```

### Get Current Ride
```dart
GET /api/ride/current
```

---

## ⚡ Quick Reference

### When to Use HTTP
- ✅ Create ride
- ✅ Accept ride
- ✅ Cancel ride
- ✅ Change status (start/complete)

### When to Use WebSocket
- ✅ Receive notifications
- ✅ Send driver location
- ✅ Get driver location
- ✅ Real-time updates

### Connection Parameters (IMPORTANT!)

```dart
IO.io(
  'https://api.vtc-sahra.com',  // ← Your backend URL
  IO.OptionBuilder()
    .setTransports(['websocket'])  // ← Force WebSocket
    .build(),
)
```

**After connection, ALWAYS authenticate:**
```dart
socket.emit('authenticate', {
  'userId': 'user-123',      // ← User ID from login
  'role': 'DRIVER',          // ← 'DRIVER' or 'USER'
});
```

---

## 🐛 Debugging

```dart
// Check connection
socket.onConnect((_) => print('✅ Connected'));
socket.onConnectError((err) => print('❌ Error: $err'));
socket.onDisconnect((_) => print('🔌 Disconnected'));

// Check events
socket.onAny((event, data) => print('📨 Event: $event, Data: $data'));
```

---

## 💡 Common Issues

**Problem:** Not receiving events  
**Solution:** Did you call `socket.emit('authenticate', {userId, role})`?

**Problem:** Connection fails  
**Solution:** Check `API_URL` is correct and server is running

**Problem:** Events coming to wrong users  
**Solution:** Make sure `userId` and `role` are correct in authenticate

---

## 📞 Support

Questions? Check:
- [WebSocket Events Reference](./WEBSOCKET_API.md)
- [Location Tracking Details](./LOCATION_TRACKING.md)
- [Nearby Rides Logic](./NEARBY_RIDES.md)
