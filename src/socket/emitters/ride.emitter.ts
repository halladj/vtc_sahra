import { Server } from 'socket.io';
import { RIDE_EVENTS, ROOMS } from '../events/ride.events';
import { getAvailableDriverLocations } from '../handlers/driver-location.handler';
import { calculateDistance, estimateTravelTime } from '../../utils/distance';

/**
 * Centralized event emitters for ride events
 * Emits to appropriate rooms based on event type
 */

export class RideEmitter {
    private readonly MAX_BROADCAST_DISTANCE_KM =
        Number(process.env.MAX_RIDE_BROADCAST_DISTANCE_KM) || 10;

    constructor(private io: Server) { }

    /**
     * Emit ride:created to nearby drivers only (within configured radius)
     */
    emitRideCreated(ride: any) {
        const driverLocations = getAvailableDriverLocations();

        // Filter drivers within radius
        const nearbyDrivers: Array<{ driverId: string; distance: number; eta: number }> = [];

        for (const [driverId, location] of driverLocations.entries()) {
            const distance = calculateDistance(
                location.latitude,
                location.longitude,
                ride.originLat,
                ride.originLng
            );

            if (distance <= this.MAX_BROADCAST_DISTANCE_KM) {
                nearbyDrivers.push({
                    driverId,
                    distance,
                    eta: estimateTravelTime(distance)
                });
            }
        }

        // Broadcast to each nearby driver with personalized distance info
        nearbyDrivers.forEach(({ driverId, distance, eta }) => {
            this.io.to(ROOMS.user(driverId)).emit(RIDE_EVENTS.CREATED, {
                ride,
                distance: Number(distance.toFixed(2)),
                estimatedArrival: eta
            });
        });

        // Log for debugging
        if (process.env.NODE_ENV !== 'test') {
            console.log(`📍 Broadcasted ride ${ride.id} to ${nearbyDrivers.length} nearby drivers`);
        }
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

    /**
     * Emit when driver cancels ACCEPTED ride (ride returns to PENDING)
     */
    emitDriverCancelled(ride: any) {
        // Notify the passenger
        this.io.to(ROOMS.user(ride.userId)).emit(RIDE_EVENTS.DRIVER_CANCELLED, {
            ride,
            message: "Driver cancelled. Finding you another driver..."
        });
    }
}
