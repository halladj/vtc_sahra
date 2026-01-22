// Location event constants
export const LOCATION_EVENTS = {
    // Driver → Server
    UPDATE: 'location:update',

    // Server → Passenger
    UPDATED: 'location:updated',

    // Errors
    ERROR: 'location:error',
} as const;
