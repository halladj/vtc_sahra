// Driver-specific event constants
export const DRIVER_EVENTS = {
    // Driver → Server
    LOCATION_UPDATE: 'driver:locationUpdate',

    // Server → Driver
    NEARBY_RIDE: 'driver:nearbyRide',
} as const;
