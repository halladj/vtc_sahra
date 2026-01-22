# Real-Time Location Tracking Documentation

## Overview
Driver location is broadcast to passengers in real-time during active rides (ACCEPTED or ONGOING status).

---

## How It Works

### Flow
```
Driver App → GPS → Socket.IO → Server → Socket.IO → Passenger App → Map Update
   (every 3-5s)                    ↓
                              Validates & Broadcasts
```

### Privacy & Security
- ✅ Only tracks during ACCEPTED/ONGOING rides
- ✅ Driver must own the ride to send location
- ✅ Auto-stops when ride ends
- ✅ No location history stored (GDPR compliant)
- ✅ Rate limited (2-second minimum)

---

## Driver Side Implementation

### React Native Example
```typescript
import { useEffect } from 'react';
import Geolocation from '@react-native-community/geolocation';
import { socket } from './socket';

function DriverLocationTracker({ ride }) {
  useEffect(() => {
    // Only track during active rides
    if (ride.status !== 'ACCEPTED' && ride.status !== 'ONGOING') {
      return;
    }

    // Update interval based on ride status
    const interval = ride.status === 'ONGOING' ? 3000 : 10000;

    // Watch position
    const watchId = Geolocation.watchPosition(
      (position) => {
        socket.emit('location:update', {
          rideId: ride.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          heading: position.coords.heading || 0,
          speed: position.coords.speed || 0,
          accuracy: position.coords.accuracy
        });
      },
      (error) => console.error('GPS error:', error),
      {
        enableHighAccuracy: true,
        distanceFilter: 10,  // Update every 10 meters minimum
        interval: interval,
        fastestInterval: 2000  // Respect server rate limit
      }
    );

    // Cleanup
    return () => Geolocation.clearWatch(watchId);
  }, [ride.status, ride.id]);

  return null; // No UI needed
}

export default DriverLocationTracker;
```

### Web Example (Browser Geolocation API)
```typescript
import { useEffect } from 'react';
import { socket } from './socket';

function DriverLocationTracker({ ride }) {
  useEffect(() => {
    if (ride.status !== 'ACCEPTED' && ride.status !== 'ONGOING') {
      return;
    }

    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          socket.emit('location:update', {
            rideId: ride.id,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            heading: position.coords.heading,
            speed: position.coords.speed
          });
        },
        (error) => console.error('GPS error:', error),
        { enableHighAccuracy: true }
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [ride.status, ride.id]);

  return null;
}
```

---

## Passenger Side Implementation

### React Native with Maps
```typescript
import React, { useState, useEffect } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { socket } from './socket';

function PassengerMap({ ride }) {
  const [driverLocation, setDriverLocation] = useState(null);

  useEffect(() => {
    // Listen for driver location updates
    const handleLocationUpdate = (location) => {
      console.log('Driver location updated:', location);
      setDriverLocation({
        latitude: location.latitude,
        longitude: location.longitude,
        heading: location.heading,
        speed: location.speed,
        timestamp: new Date(location.timestamp)
      });
    };

    socket.on('location:updated', handleLocationUpdate);

    // Cleanup
    return () => {
      socket.off('location:updated', handleLocationUpdate);
    };
  }, []);

  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      initialRegion={{
        latitude: ride.originLat,
        longitude: ride.originLng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01
      }}
    >
      {/* Pickup Location */}
      <Marker
        coordinate={{
          latitude: ride.originLat,
          longitude: ride.originLng
        }}
        title="Pickup"
        pinColor="green"
      />

      {/* Destination */}
      <Marker
        coordinate={{
          latitude: ride.destLat,
          longitude: ride.destLng
        }}
        title="Destination"
        pinColor="red"
      />

      {/* Driver Location (updates in real-time) */}
      {driverLocation && (
        <Marker
          coordinate={{
            latitude: driverLocation.latitude,
            longitude: driverLocation.longitude
          }}
          title="Your Driver"
          description={`Speed: ${Math.round(driverLocation.speed)} km/h`}
          rotation={driverLocation.heading}
        >
          {/* Custom car icon */}
          <Image
            source={require('./assets/car-icon.png')}
            style={{ width: 40, height: 40 }}
          />
        </Marker>
      )}
    </MapView>
  );
}

export default PassengerMap;
```

### Web Example with Google Maps
```typescript
import React, { useState, useEffect, useRef } from 'react';
import { GoogleMap, Marker, useLoadScript } from '@react-google-maps/api';
import { socket } from './socket';

function PassengerMap({ ride }) {
  const [driverLocation, setDriverLocation] = useState(null);
  const mapRef = useRef(null);

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY
  });

  useEffect(() => {
    socket.on('location:updated', (location) => {
      setDriverLocation({
        lat: location.latitude,
        lng: location.longitude,
        heading: location.heading
      });

      // Optional: Auto-center map on driver
      if (mapRef.current) {
        mapRef.current.panTo({ 
          lat: location.latitude, 
          lng: location.longitude 
        });
      }
    });

    return () => socket.off('location:updated');
  }, []);

  if (!isLoaded) return <div>Loading map...</div>;

  return (
    <GoogleMap
      zoom={15}
      center={{ lat: ride.originLat, lng: ride.originLng }}
      mapContainerStyle={{ width: '100%', height: '100vh' }}
      onLoad={(map) => (mapRef.current = map)}
    >
      {/* Pickup marker */}
      <Marker
        position={{ lat: ride.originLat, lng: ride.originLng }}
        label="A"
      />

      {/* Destination marker */}
      <Marker
        position={{ lat: ride.destLat, lng: ride.destLng }}
        label="B"
      />

      {/* Driver marker (updates in real-time) */}
      {driverLocation && (
        <Marker
          position={driverLocation}
          icon={{
            url: '/car-icon.svg',
            rotation: driverLocation.heading,
            scaledSize: new window.google.maps.Size(40, 40)
          }}
          title="Your Driver"
        />
      )}
    </GoogleMap>
  );
}
```

---

## WebSocket Events

### `location:update` (Driver → Server)
Send driver's current location to server.

**Emit:**
```javascript
socket.emit('location:update', {
  rideId: string,       // Required
  latitude: number,     // Required (-90 to 90)
  longitude: number,    // Required (-180 to 180)
  heading: number,      // Optional (0-360 degrees)
  speed: number,        // Optional (km/h)
  accuracy: number      // Optional (meters)
});
```

**Validation:**
- Coordinates must be within valid ranges
- Driver must own the ride
- Ride must be ACCEPTED or ONGOING
- Rate limited to 1 update per 2 seconds

**Errors:**
```javascript
socket.on('location:error', (error) => {
  // error.code: 'INVALID_LOCATION', 'UNAUTHORIZED', 'RIDE_NOT_FOUND', etc.
  // error.message: Human-readable error message
});
```

### `location:updated` (Server → Passenger)
Receive driver location updates.

**Listen:**
```javascript
socket.on('location:updated', (location) => {
  // location: {
  //   driverId: string,
  //   latitude: number,
  //   longitude: number,
  //   heading: number,
  //   speed: number,
  //   accuracy: number,
  //   timestamp: Date
  // }
});
```

---

## Advanced Features

### Calculate ETA
```typescript
function calculateETA(driverLocation, destination) {
  // Distance calculation (Haversine formula)
  const R = 6371; // Earth radius in km
  const dLat = (destination.lat - driverLocation.lat) * Math.PI / 180;
  const dLon = (destination.lng - driverLocation.lng) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(driverLocation.lat * Math.PI / 180) * 
    Math.cos(destination.lat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // km
  
  // ETA calculation (assuming average speed)
  const avgSpeed = driverLocation.speed || 30; // km/h
  const etaMinutes = (distance / avgSpeed) * 60;
  
  return Math.round(etaMinutes);
}

// Usage
const eta = calculateETA(driverLocation, { 
  lat: ride.destLat, 
  lng: ride.destLng 
});
console.log(`ETA: ${eta} minutes`);
```

### Smooth Marker Animation
```typescript
import { Animated } from 'react-native';

function AnimatedDriverMarker({ location }) {
  const position = useRef(new Animated.ValueXY()).current;

  useEffect(() => {
    Animated.timing(position, {
      toValue: { x: location.longitude, y: location.latitude },
      duration: 1000,
      useNativeDriver: false
    }).start();
  }, [location]);

  return (
    <Marker.Animated
      coordinate={position.getLayout()}
      rotation={location.heading}
    />
  );
}
```

---

## Performance

### Battery Impact
- ~3-5% battery drain per hour
- Optimize by:
  - Stop tracking when app is backgrounded
  - Use adaptive intervals (slower speed = less frequent)
  - Increase distanceFilter to 20-50m

### Network Usage
- ~50 bytes per update
- 10-20 updates/minute = ~600 bytes/minute
- **~1 MB per ride** on average

### Scaling
- **In-memory**: Handles 1000s concurrent rides
- **Redis**: Unlimited scaling across multiple servers

---

## Error Handling

### Common Errors

| Code | Meaning | Solution |
|------|---------|----------|
| `INVALID_LOCATION` | Bad coordinates | Check GPS permissions |
| `UNAUTHORIZED` | Not the driver | Verify user is driver |
| `RIDE_NOT_FOUND` | Ride doesn't exist | Check ride ID |
| `INVALID_RIDE_STATUS` | Ride not active | Only track ACCEPTED/ONGOING |

### Example Error Handler
```typescript
socket.on('location:error', (error) => {
  switch (error.code) {
    case 'INVALID_LOCATION':
      console.error('GPS error - check permissions');
      break;
    case 'UNAUTHORIZED':
      console.error('You are not the driver of this ride');
      break;
    case 'INVALID_RIDE_STATUS':
      console.log('Ride ended - stopping location tracking');
      break;
    default:
      console.error('Location error:', error.message);
  }
});
```

---

## Testing

### Manual Test with Socket.IO Client
```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  auth: { token: 'YOUR_DRIVER_JWT_TOKEN' }
});

socket.on('connect', () => {
  console.log('Connected!');
  
  // Send location update
  socket.emit('location:update', {
    rideId: 'test-ride-123',
    latitude: 36.7538,
    longitude: 3.0588,
    heading: 90,
    speed: 50
  });
});

socket.on('location:error', console.error);
```

---

## Best Practices

1. **Privacy**: Only track during active rides
2. **Battery**: Use adaptive intervals based on speed
3. **Accuracy**: Filter out low-accuracy readings (> 50m)
4. **UX**: Show loading states while waiting for first update
5. **Offline**: Handle connection loss gracefully
6. **Testing**: Test with various GPS scenarios (tunnels, poor signal)

---

## Future Enhancements

- [ ] Polyline route display
- [ ] Geofencing (alert when driver arrives)
- [ ] Historical route replay
- [ ] Multi-stop support
- [ ] Traffic-aware ETA

---

**Last Updated**: January 2026  
**Version**: 1.0.0
