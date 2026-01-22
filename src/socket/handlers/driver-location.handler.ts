import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth.middleware';
import { DRIVER_EVENTS } from '../events/driver.events';
import { Role } from '@prisma/client';

/**
 * Driver location data
 */
interface DriverLocation {
    latitude: number;
    longitude: number;
    lastUpdate: Date;
}

/**
 * In-memory storage for available driver locations
 * Key: driverId, Value: location data
 */
const availableDriverLocations = new Map<string, DriverLocation>();

/**
 * Configuration
 */
const LOCATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validate driver location data
 */
const isValidDriverLocation = (data: any): boolean => {
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
        return false;
    }

    if (data.latitude < -90 || data.latitude > 90) return false;
    if (data.longitude < -180 || data.longitude > 180) return false;

    return true;
};

/**
 * Setup driver location handlers
 */
export const setupDriverLocationHandlers = (io: Server, socket: AuthenticatedSocket) => {
    // Only drivers can send location updates
    if (socket.role !== Role.DRIVER) {
        return;
    }

    /**
     * Handle driver location update (when available for rides)
     */
    socket.on(DRIVER_EVENTS.LOCATION_UPDATE, (data: { latitude: number; longitude: number }) => {
        try {
            // Validate location
            if (!isValidDriverLocation(data)) {
                socket.emit('error', {
                    message: 'Invalid location data',
                    code: 'INVALID_LOCATION'
                });
                return;
            }

            // Store driver location
            availableDriverLocations.set(socket.userId!, {
                latitude: data.latitude,
                longitude: data.longitude,
                lastUpdate: new Date()
            });

        } catch (error: any) {
            socket.emit('error', {
                message: error.message || 'Failed to update driver location',
                code: 'UPDATE_FAILED'
            });
        }
    });

    /**
     * Handle disconnect - remove driver location
     */
    socket.on('disconnect', () => {
        availableDriverLocations.delete(socket.userId!);
    });
};

/**
 * Get all available driver locations
 */
export const getAvailableDriverLocations = (): Map<string, DriverLocation> => {
    // Remove stale locations (older than 5 minutes)
    const now = new Date();
    for (const [driverId, location] of availableDriverLocations.entries()) {
        if (now.getTime() - location.lastUpdate.getTime() > LOCATION_TIMEOUT_MS) {
            availableDriverLocations.delete(driverId);
        }
    }

    return new Map(availableDriverLocations);
};

/**
 * Clear all driver locations (for testing)
 */
export const clearAllDriverLocations = () => {
    availableDriverLocations.clear();
};
