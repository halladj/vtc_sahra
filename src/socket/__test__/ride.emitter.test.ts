import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RideEmitter } from '../emitters/ride.emitter';
import { Server } from 'socket.io';
import { RIDE_EVENTS } from '../events/ride.events';

// Mock dependencies
jest.mock('../handlers/driver-location.handler', () => ({
    getAvailableDriverLocations: jest.fn()
}));

import { getAvailableDriverLocations } from '../handlers/driver-location.handler';

describe('RideEmitter', () => {
    let rideEmitter: RideEmitter;
    let mockIo: any;
    let mockEmit: jest.Mock;
    let mockTo: jest.Mock;

    beforeEach(() => {
        // Setup Socket.IO mock
        mockEmit = jest.fn();
        mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
        mockIo = {
            to: mockTo
        } as unknown as Server;

        rideEmitter = new RideEmitter(mockIo);
        jest.clearAllMocks();
    });

    describe('emitRideCancelled', () => {
        it('should broadcast to nearby drivers when PENDING ride is cancelled', () => {
            // 1. Mock ride data (PENDING status)
            const mockRide = {
                id: 'ride-123',
                userId: 'passenger-1',
                status: 'PENDING',
                originLat: 36.75,
                originLng: 3.05,
                driverId: null
            };

            // 2. Mock nearby driver locations
            const mockDrivers = new Map();
            // Driver A: Very close (should receive event)
            mockDrivers.set('driver-A', {
                latitude: 36.751, // ~100m away
                longitude: 3.051,
                lastUpdate: new Date()
            });
            // Driver B: Far away (should NOT receive event)
            mockDrivers.set('driver-B', {
                latitude: 36.90, // ~16km away (assuming > 10km limit)
                longitude: 3.20,
                lastUpdate: new Date()
            });

            (getAvailableDriverLocations as jest.Mock).mockReturnValue(mockDrivers);

            // 3. Execute
            rideEmitter.emitRideCancelled(mockRide, 'User cancelled');

            // 4. Verify broadcast to nearby driver (Driver A)
            expect(mockTo).toHaveBeenCalledWith('user:driver-A');
            expect(mockEmit).toHaveBeenCalledWith(RIDE_EVENTS.CANCELLED, {
                ride: mockRide,
                reason: 'Client cancelled the request'
            });

            // 5. Verify NO broadcast to far driver (Driver B)
            expect(mockTo).not.toHaveBeenCalledWith('user:driver-B');

            // 6. Verify always emits to passenger and ride room
            expect(mockTo).toHaveBeenCalledWith('user:passenger-1');
            expect(mockTo).toHaveBeenCalledWith('ride:ride-123');
        });

        it('should NOT broadcast to nearby drivers when ONGOING ride is cancelled', () => {
            // 1. Mock ride data (ONGOING status)
            const mockRide = {
                id: 'ride-456',
                userId: 'passenger-2',
                status: 'ONGOING',
                originLat: 36.75,
                originLng: 3.05,
                driverId: 'driver-assigned'
            };

            // 2. Mock nearby drivers (even if present)
            const mockDrivers = new Map();
            mockDrivers.set('driver-C', { latitude: 36.75, longitude: 3.05, lastUpdate: new Date() });
            (getAvailableDriverLocations as jest.Mock).mockReturnValue(mockDrivers);

            // 3. Execute
            rideEmitter.emitRideCancelled(mockRide);

            // 4. Verify ONLY assigned driver and passenger get event
            expect(mockTo).toHaveBeenCalledWith('user:driver-assigned');
            expect(mockTo).toHaveBeenCalledWith('user:passenger-2');

            // 5. Verify nearby driver-C did NOT get it
            expect(mockTo).not.toHaveBeenCalledWith('user:driver-C');
        });
    });
});
