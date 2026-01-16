// Event name constants for type safety
export const RIDE_EVENTS = {
    // Client -> Server
    UPDATE_STATUS: 'ride:updateStatus',

    // Server -> Client
    CREATED: 'ride:created',
    ACCEPTED: 'ride:accepted',
    STATUS_UPDATED: 'ride:statusUpdated',
    CANCELLED: 'ride:cancelled',
    ERROR: 'ride:error',
} as const;

// Room name helpers
export const ROOMS = {
    drivers: () => 'drivers',
    ride: (rideId: string) => `ride:${rideId}`,
    user: (userId: string) => `user:${userId}`,
} as const;
