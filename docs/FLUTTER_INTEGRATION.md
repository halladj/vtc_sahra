# Flutter Integration Guide - VTC Sahra Backend

Complete guide for integrating the VTC Sahra real-time ride system with Flutter.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [HTTP API](#http-api)
3. [WebSocket Events](#websocket-events)
4. [Driver Implementation](#driver-implementation)
5. [Passenger Implementation](#passenger-implementation)
6. [Complete Examples](#complete-examples)

---

## Quick Start

### Dependencies

```yaml
# pubspec.yaml
dependencies:
  socket_io_client: ^2.0.0
  http: ^1.1.0
  geolocator: ^10.0.0
```

### Architecture Pattern

```
✅ HTTP for mutations (create, accept, cancel, status)
✅ WebSocket for notifications (real-time events)
✅ Connect socket on login (not after ride acceptance)
```

---

## HTTP API

### Base URL
```dart
const API_URL = 'https://api.vtc-sahra.com';
```

### Authentication
```dart
final headers = {
  'Authorization': 'Bearer $jwtToken',
  'Content-Type': 'application/json',
};
```

### Endpoints

#### **Create Ride** (Passenger)
```dart
final response = await http.post(
  Uri.parse('$API_URL/api/ride'),
  headers: headers,
  body: jsonEncode({
    'type': 'RIDE_HAILING',      // or 'RIDE_POOLING', 'PACKAGE_DELIVERY'
    'originLat': 36.7538,
    'originLng': 3.0588,
    'destLat': 36.7528,
    'destLng': 3.0428,
  }),
);

// Response: { id, status: 'PENDING', price, ... }
```

#### **Accept Ride** (Driver)
```dart
final response = await http.post(
  Uri.parse('$API_URL/api/ride/$rideId/accept'),
  headers: headers,
  body: jsonEncode({
    'vehicleId': 'vehicle-123',
  }),
);

// Response: { id, status: 'ACCEPTED', driverId, ... }
```

#### **Update Status** (Driver)
```dart
final response = await http.put(
  Uri.parse('$API_URL/api/ride/$rideId/status'),
  headers: headers,
  body: jsonEncode({
    'status': 'ONGOING',  // or 'COMPLETED'
  }),
);

// Valid transitions:
// ACCEPTED → ONGOING
// ONGOING → COMPLETED
```

#### **Cancel Ride** (Both)
```dart
final response = await http.put(
  Uri.parse('$API_URL/api/ride/$rideId/cancel'),
  headers: headers,
);

// Behavior depends on who cancels:
// - Driver cancels ACCEPTED → Returns to PENDING (auto re-match)
// - Driver cancels ONGOING → CANCELLED
// - Passenger cancels → CANCELLED
```

#### **Get Current Ride**
```dart
final response = await http.get(
  Uri.parse('$API_URL/api/ride/current'),
  headers: headers,
);

// Returns current PENDING/ACCEPTED/ONGOING ride or null
```

---

## WebSocket Events

### Connection Setup

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class SocketService {
  late IO.Socket socket;
  
  void connect(String userId, String role, String token) {
    socket = IO.io('$API_URL', <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
    });
    
    socket.onConnect((_) {
      print('✅ Connected');
      // Authenticate immediately
      socket.emit('authenticate', {
        'userId': userId,
        'role': role,  // 'DRIVER' or 'USER'
      });
    });
    
    socket.onDisconnect((_) => print('❌ Disconnected'));
    socket.onReconnect((_) {
      print('🔄 Reconnected');
      socket.emit('authenticate', {'userId': userId, 'role': role});
    });
    
    socket.connect();
  }
  
  void disconnect() {
    socket.disconnect();
  }
}
```

### Event Reference

| Event | Direction | Who Receives | When Fired |
|-------|-----------|--------------|------------|
| `ride:created` | Server → Client | Nearby drivers (10km) | Ride created or returned to PENDING |
| `ride:accepted` | Server → Client | Passenger | Driver accepts ride |
| `ride:statusUpdated` | Server → Client | Both | Status changes (ONGOING, COMPLETED) |
| `ride:driverCancelled` | Server → Client | Passenger | Driver cancels ACCEPTED ride |
| `ride:cancelled` | Server → Client | Both | Final cancellation |
| `location:updated` | Server → Client | Passenger | Driver sends location |
| `driver:locationUpdate` | Client → Server | Server | Driver sends availability location |
| `location:update` | Client → Server | Server | Driver sends active ride location |

---

## Driver Implementation

### 1. Connect Socket on Login

```dart
class AuthService {
  Future<void> login(String email, String password) async {
    final response = await http.post(...);
    final data = response.data;
    
    // Save credentials
    await storage.write('token', data['token']);
    await storage.write('userId', data['user']['id']);
    
    // ✅ Connect WebSocket immediately
    SocketService().connect(
      data['user']['id'],
      'DRIVER',
      data['token'],
    );
  }
}
```

### 2. Send Location When Available

```dart
Timer? _locationTimer;

void startLocationUpdates() {
  _locationTimer = Timer.periodic(Duration(seconds: 30), (_) async {
    final position = await Geolocator.getCurrentPosition();
    
    // Send location so server knows you're available for nearby rides
    SocketService().socket.emit('driver:locationUpdate', {
      'latitude': position.latitude,
      'longitude': position.longitude,
    });
  });
}

void stopLocationUpdates() {
  _locationTimer?.cancel();
}
```

### 3. Listen for Nearby Rides

```dart
void listenForRides() {
  socket.on('ride:created', (data) {
    final ride = Ride.fromJson(data['ride']);
    final distance = data['distance'];      // km
    final eta = data['estimatedArrival'];   // minutes
    
    // Show notification
    showNotification(
      'New Ride',
      '$distance km away • ETA: $eta min • ${ride.price} DA',
    );
    
    // Add to available rides list
    setState(() {
      availableRides.add(ride);
    });
  });
  
  // Remove ride if accepted by another driver
  socket.on('ride:accepted', (data) {
    if (data['driverId'] != myDriverId) {
      setState(() {
        availableRides.removeWhere((r) => r.id == data['rideId']);
      });
    }
  });
}
```

### 4. Accept Ride via HTTP

```dart
Future<void> acceptRide(String rideId) async {
  try {
    final response = await http.post(
      Uri.parse('$API_URL/api/ride/$rideId/accept'),
      headers: headers,
      body: jsonEncode({'vehicleId': selectedVehicleId}),
    );
    
    if (response.statusCode == 200) {
      showSuccess('Ride accepted!');
      navigateToActiveRide();
    }
  } catch (e) {
    if (e.toString().contains('Insufficient balance')) {
      showError('Top up your wallet to accept rides');
    }
  }
}
```

### 5. Send Live Location During Ride

```dart
void sendLiveLocation() {
  Timer.periodic(Duration(seconds: 3), (_) async {
    if (currentRide == null) return;
    
    final position = await Geolocator.getCurrentPosition();
    
    socket.emit('location:update', {
      'rideId': currentRide!.id,
      'latitude': position.latitude,
      'longitude': position.longitude,
      'heading': position.heading,
      'speed': position.speed,
      'accuracy': position.accuracy,
    });
  });
}
```

### 6. Handle Passenger Cancellation

```dart
void listenForCancellation() {
  socket.on('ride:cancelled', (data) {
    if (data['rideId'] == currentRide?.id) {
      showMessage('Passenger cancelled the ride');
      setState(() {
        currentRide = null;
      });
      navigateToAvailableRides();
    }
  });
}
```

---

## Passenger Implementation

### 1. Create Ride via HTTP

```dart
Future<String> createRide() async {
  final response = await http.post(
    Uri.parse('$API_URL/api/ride'),
    headers: headers,
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
```

### 2. Listen for Driver Acceptance

```dart
void listenForDriver(String rideId) {
  socket.on('ride:accepted', (data) {
    if (data['rideId'] == rideId) {
      final driver = data['driver'];
      final vehicle = data['vehicle'];
      
      setState(() {
        driverName = '${driver['firstName']} ${driver['lastName']}';
        driverPhone = driver['phoneNumber'];
        vehiclePlate = vehicle['plate'];
      });
      
      showMessage('$driverName is coming!');
    }
  });
}
```

### 3. Handle Driver Cancellation (NEW!)

```dart
void listenForDriverCancellation(String rideId) {
  // ✅ NEW EVENT: Driver cancelled but ride returns to PENDING
  socket.on('ride:driverCancelled', (data) {
    if (data['rideId'] == rideId) {
      showMessage(data['message']); 
      // "Driver cancelled. Finding you another driver..."
      
      setState(() {
        driverName = null;  // Clear driver info
        status = 'PENDING'; // Ride is being re-matched
      });
    }
  });
  
  // Then automatically receive new driver acceptance
  socket.on('ride:accepted', (data) {
    if (data['rideId'] == rideId) {
      showMessage('New driver ${data['driver']['firstName']} accepted!');
      // Update UI with new driver
    }
  });
}
```

### 4. Track Driver Location

```dart
void trackDriverLocation() {
  socket.on('location:updated', (data) {
    if (data['rideId'] == currentRide?.id) {
      setState(() {
        driverLatLng = LatLng(data['latitude'], data['longitude']);
        driverHeading = data['heading'];
      });
      
      // Update map marker
      updateDriverMarker(driverLatLng, heading: driverHeading);
      
      // Calculate ETA
      final eta = calculateETA(driverLatLng, pickupLatLng);
      updateETA(eta);
    }
  });
}
```

### 5. Handle Status Updates

```dart
void listenForStatusUpdates() {
  socket.on('ride:statusUpdated', (data) {
    if (data['rideId'] == currentRide?.id) {
      final newStatus = data['status'];
      
      setState(() {
        currentRide!.status = newStatus;
      });
      
      if (newStatus == 'ONGOING') {
        showMessage('Ride started!');
      } else if (newStatus == 'COMPLETED') {
        showMessage('Ride completed!');
        navigateToRating();
      }
    }
  });
}
```

---

## Complete Examples

### Complete Driver Service

```dart
class DriverService {
  final SocketService _socket = SocketService();
  List<Ride> availableRides = [];
  Ride? currentRide;
  
  void initialize() {
    _socket.connect(userId, 'DRIVER', token);
    _listenForRides();
    _listenForUpdates();
    startLocationUpdates();
  }
  
  void _listenForRides() {
    _socket.socket.on('ride:created', (data) {
      availableRides.add(Ride.fromJson(data['ride']));
      notifyListeners();
    });
    
    _socket.socket.on('ride:accepted', (data) {
      if (data['driverId'] == userId) {
        currentRide = Ride.fromJson(data['ride']);
      } else {
        availableRides.removeWhere((r) => r.id == data['rideId']);
      }
      notifyListeners();
    });
  }
  
  void _listenForUpdates() {
    _socket.socket.on('ride:cancelled', (data) {
      if (data['rideId'] == currentRide?.id) {
        currentRide = null;
        notifyListeners();
      }
    });
  }
  
  Future<void> acceptRide(String rideId) async {
    await http.post(Uri.parse('$API_URL/api/ride/$rideId/accept'), ...);
  }
  
  Future<void> startRide() async {
    await http.put(
      Uri.parse('$API_URL/api/ride/${currentRide!.id}/status'),
      body: jsonEncode({'status': 'ONGOING'}),
    );
  }
  
  Future<void> completeRide() async {
    await http.put(
      Uri.parse('$API_URL/api/ride/${currentRide!.id}/status'),
      body: jsonEncode({'status': 'COMPLETED'}),
    );
  }
}
```

### Complete Passenger Service

```dart
class PassengerService {
  final SocketService _socket = SocketService();
  Ride? currentRide;
  LatLng? driverLocation;
  
  void initialize() {
    _socket.connect(userId, 'USER', token);
    _listenForUpdates();
  }
  
  Future<void> createRide({
    required LatLng pickup,
    required LatLng destination,
  }) async {
    final response = await http.post(
      Uri.parse('$API_URL/api/ride'),
      body: jsonEncode({
        'type': 'RIDE_HAILING',
        'originLat': pickup.latitude,
        'originLng': pickup.longitude,
        'destLat': destination.latitude,
        'destLng': destination.longitude,
      }),
    );
    
    currentRide = Ride.fromJson(jsonDecode(response.body));
    notifyListeners();
  }
  
  void _listenForUpdates() {
    // Driver accepts
    _socket.socket.on('ride:accepted', (data) {
      if (data['rideId'] == currentRide?.id) {
        currentRide = Ride.fromJson(data['ride']);
        notifyListeners();
      }
    });
    
    // Driver cancels (returns to PENDING)
    _socket.socket.on('ride:driverCancelled', (data) {
      if (data['rideId'] == currentRide?.id) {
        currentRide!.driver = null;
        currentRide!.status = 'PENDING';
        showSnackbar(data['message']);
        notifyListeners();
      }
    });
    
    // Driver location updates
    _socket.socket.on('location:updated', (data) {
      if (data['rideId'] == currentRide?.id) {
        driverLocation = LatLng(data['latitude'], data['longitude']);
        notifyListeners();
      }
    });
    
    // Status updates
    _socket.socket.on('ride:statusUpdated', (data) {
      if (data['rideId'] == currentRide?.id) {
        currentRide!.status = data['status'];
        notifyListeners();
      }
    });
    
    // Cancellation
    _socket.socket.on('ride:cancelled', (data) {
      if (data['rideId'] == currentRide?.id) {
        currentRide = null;
        notifyListeners();
      }
    });
  }
}
```

---

## Key Differences from Old Pattern

| Aspect | ❌ Old Pattern | ✅ New Pattern |
|--------|---------------|---------------|
| Socket Connection | After ride acceptance | On login |
| Pending Rides | HTTP polling every 5s | Real-time `ride:created` |
| Driver Cancel | Ride lost forever | Returns to PENDING, auto re-match |
| Location | Not implemented | Real-time tracking |
| Nearby Filter | Client-side (all rides) | Server-side (10km only) |

---

## Testing Tips

### Test WebSocket Connection
```dart
socket.onConnect((_) => print('✅ Connected'));
socket.onConnectError((err) => print('❌ Error: $err'));
socket.on('error', (error) => print('Socket error: $error'));
```

### Test Authentication
```dart
socket.emit('authenticate', {'userId': userId, 'role': role});
// Should not receive any error events
```

### Test Reconnection
```dart
socket.onReconnect((_) {
  print('🔄 Reconnected - re-authenticating');
  socket.emit('authenticate', {'userId': userId, 'role': role});
});
```

---

## Environment Variables

```dart
// config.dart
class Config {
  static const API_URL = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://api.vtc-sahra.com',
  );
  
  static const DRIVER_LOCATION_INTERVAL = 30; // seconds (when AVAILABLE)
  static const ACTIVE_RIDE_LOCATION_INTERVAL = 3; // seconds (during ride)
}
```

---

## Error Handling

```dart
Future<void> safeHttpCall(Future<http.Response> Function() call) async {
  try {
    final response = await call();
    
    if (response.statusCode == 400) {
      final error = jsonDecode(response.body)['error'];
      throw BadRequestException(error);
    } else if (response.statusCode == 403) {
      throw UnauthorizedException();
    } else if (response.statusCode == 404) {
      throw NotFoundException();
    }
  } on SocketException {
    throw NetworkException('No internet connection');
  }
}
```

---

## Support

For issues or questions, contact the backend team or check:
- [WebSocket API Reference](./WEBSOCKET_API.md)
- [Location Tracking Guide](./LOCATION_TRACKING.md)
- [Nearby Rides Documentation](./NEARBY_RIDES.md)
