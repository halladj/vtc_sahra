import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth.middleware';
import { LOCATION_EVENTS } from '../events/location.events';
import { ROOMS } from '../events/ride.events';
import { db } from '../../utils/db';
import { RideStatus } from '@prisma/client';

/**
 * Location data structure
 */
interface LocationUpdate {
    rideId: string;
    latitude: number;
    longitude: number;
    heading?: number;   // Direction in degrees (0-360)
    speed?: number;     // Speed in km/h
    accuracy?: number;  // GPS accuracy in meters
}

/**
 * In-memory storage for current driver locations
 * In production, consider Redis for multi-server scaling
 */
const driverLocations = new Map<string, LocationUpdate & { timestamp: Date }>();

/**
 * Rate limiting map: driverId -> last update timestamp
 */
const lastUpdateTime = new Map<string, number>();
const MIN_UPDATE_INTERVAL = 2000; // 2 seconds minimum between updates

/**
 * Validate location data
 */
const isValidLocation = (data: any): data is LocationUpdate => {
    if (!data.rideId || typeof data.rideId !== 'string') return false;
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return false;

    // Validate coordinate ranges
    if (data.latitude < -90 || data.latitude > 90) return false;
    if (data.longitude < -180 || data.longitude > 180) return false;

    // Validate optional fields
    if (data.heading !== undefined && (data.heading < 0 || data.heading > 360)) return false;
    if (data.speed !== undefined && data.speed < 0) return false;
    if (data.accuracy !== undefined && data.accuracy < 0) return false;

    return true;
};

/**
 * Setup location tracking handlers for a socket
 */
export const setupLocationHandlers = (io: Server, socket: AuthenticatedSocket) => {
    /**
     * Handle location:update from driver
     */
    socket.on(LOCATION_EVENTS.UPDATE, async (data: LocationUpdate) => {
        try {
            const driverId = socket.userId!;

            // Rate limiting
            const now = Date.now();
            const lastUpdate = lastUpdateTime.get(driverId) || 0;
            if (now - lastUpdate < MIN_UPDATE_INTERVAL) {
                return; // Silently drop (too frequent)
            }
            lastUpdateTime.set(driverId, now);

            // Validate location data
            if (!isValidLocation(data)) {
                socket.emit(LOCATION_EVENTS.ERROR, {
                    message: 'Invalid location data',
                    code: 'INVALID_LOCATION'
                });
                return;
            }

            // Verify ride exists and driver owns it
            const ride = await db.ride.findUnique({
                where: { id: data.rideId },
                select: {
                    id: true,
                    userId: true,
                    driverId: true,
                    status: true
                }
            });

            if (!ride) {
                socket.emit(LOCATION_EVENTS.ERROR, {
                    message: 'Ride not found',
                    code: 'RIDE_NOT_FOUND'
                });
                return;
            }

            // Verify socket user is the driver
            if (ride.driverId !== driverId) {
                socket.emit(LOCATION_EVENTS.ERROR, {
                    message: 'Unauthorized: You are not the driver of this ride',
                    code: 'UNAUTHORIZED'
                });
                return;
            }

            // Only track during ACCEPTED or ONGOING rides (privacy)
            if (ride.status !== RideStatus.ACCEPTED && ride.status !== RideStatus.ONGOING) {
                socket.emit(LOCATION_EVENTS.ERROR, {
                    message: 'Location tracking only available during active rides',
                    code: 'INVALID_RIDE_STATUS'
                });
                return;
            }

            // Store location in memory
            const locationData = {
                ...data,
                timestamp: new Date()
            };
            driverLocations.set(driverId, locationData);

            // Broadcast to passenger
            io.to(ROOMS.user(ride.userId)).emit(LOCATION_EVENTS.UPDATED, {
                driverId,
                latitude: data.latitude,
                longitude: data.longitude,
                heading: data.heading,
                speed: data.speed,
                accuracy: data.accuracy,
                timestamp: locationData.timestamp
            });

        } catch (error: any) {
            socket.emit(LOCATION_EVENTS.ERROR, {
                message: error.message || 'Failed to update location',
                code: 'UPDATE_FAILED'
            });
        }
    });

    /**
     * Handle disconnect - cleanup location data
     */
    socket.on('disconnect', () => {
        const driverId = socket.userId;
        if (driverId) {
            driverLocations.delete(driverId);
            lastUpdateTime.delete(driverId);
        }
    });
};

/**
 * Get current location of a driver (for testing/debugging)
 */
export const getDriverLocation = (driverId: string) => {
    return driverLocations.get(driverId);
};

/**
 * Clear all location data (for testing)
 */
export const clearAllLocations = () => {
    driverLocations.clear();
    lastUpdateTime.clear();
};
