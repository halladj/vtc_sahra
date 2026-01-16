import { Server } from 'socket.io';
import { RIDE_EVENTS, ROOMS } from '../events/ride.events';

/**
 * Centralized event emitters for ride events
 * Emits to appropriate rooms based on event type
 */

export class RideEmitter {
    constructor(private io: Server) { }

    /**
     * Emit ride:created to all drivers
     */
    emitRideCreated(ride: any) {
        this.io.to(ROOMS.drivers()).emit(RIDE_EVENTS.CREATED, { ride });
    }

    /**
     * Emit ride:accepted to passenger and join both parties to ride room
     */
    emitRideAccepted(ride: any) {
        const rideRoom = ROOMS.ride(ride.id);

        // Emit to passenger
        this.io.to(ROOMS.user(ride.userId)).emit(RIDE_EVENTS.ACCEPTED, { ride });

        // Join both passenger and driver to ride-specific room
        // Note: This requires the sockets to already be connected
        // The actual joining happens when sockets receive the event
    }

    /**
     * Emit ride:statusUpdated to all parties in the ride
     */
    emitRideStatusUpdated(ride: any) {
        const rideRoom = ROOMS.ride(ride.id);
        this.io.to(rideRoom).emit(RIDE_EVENTS.STATUS_UPDATED, { ride });

        // Also emit to passenger and driver individually
        this.io.to(ROOMS.user(ride.userId)).emit(RIDE_EVENTS.STATUS_UPDATED, { ride });
        if (ride.driverId) {
            this.io.to(ROOMS.user(ride.driverId)).emit(RIDE_EVENTS.STATUS_UPDATED, { ride });
        }
    }

    /**
     * Emit ride:cancelled to all parties
     */
    emitRideCancelled(ride: any, reason?: string) {
        const rideRoom = ROOMS.ride(ride.id);
        this.io.to(rideRoom).emit(RIDE_EVENTS.CANCELLED, { ride, reason });

        // Also emit to passenger and driver individually
        this.io.to(ROOMS.user(ride.userId)).emit(RIDE_EVENTS.CANCELLED, { ride, reason });
        if (ride.driverId) {
            this.io.to(ROOMS.user(ride.driverId)).emit(RIDE_EVENTS.CANCELLED, { ride, reason });
        }
    }

    /**
     * Emit error to specific socket
     */
    emitError(socketId: string, event: string, message: string, code: string) {
        this.io.to(socketId).emit(RIDE_EVENTS.ERROR, { event, message, code });
    }
}
