import { Server as HTTPServer } from 'http';
import { Server, Socket as ServerSocket } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { initializeSocket } from '../../socket';
import { db } from '../../utils/db';
import { RideStatus } from '@prisma/client';
import { generateToken } from '../../utils/jwt';

jest.mock('../../utils/db', () => ({
    db: {
        ride: {
            findUnique: jest.fn(),
        },
    },
}));

describe('Location Tracking - WebSocket', () => {
    let httpServer: HTTPServer;
    let io: Server;
    let driverClient: ClientSocket;
    let passengerClient: ClientSocket;
    let serverPort: number;

    const driverToken = generateToken({ userId: 'driver-123', role: 'DRIVER' });
    const passengerToken = generateToken({ userId: 'passenger-456', role: 'USER' });

    beforeAll((done) => {
        httpServer = require('http').createServer();
        io = initializeSocket(httpServer);

        httpServer.listen(() => {
            const address = httpServer.address();
            serverPort = typeof address === 'object' ? address!.port : 3000;
            done();
        });
    });

    afterAll(() => {
        io.close();
        httpServer.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Valid Location Updates', () => {
        it('should accept valid location update from driver during ONGOING ride', (done) => {
            const mockRide = {
                id: 'ride-123',
                userId: 'passenger-456',
                driverId: 'driver-123',
                status: RideStatus.ONGOING,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            driverClient = Client(`http://localhost:${serverPort}`, {
                auth: { token: driverToken }
            });

            passengerClient = Client(`http://localhost:${serverPort}`, {
                auth: { token: passengerToken }
            });

            passengerClient.on('location:updated', (data) => {
                expect(data.driverId).toBe('driver-123');
                expect(data.latitude).toBe(36.7538);
                expect(data.longitude).toBe(3.0588);
                expect(data.speed).toBe(50);

                driverClient.disconnect();
                passengerClient.disconnect();
                done();
            });

            driverClient.on('connect', () => {
                driverClient.emit('location:update', {
                    rideId: 'ride-123',
                    latitude: 36.7538,
                    longitude: 3.0588,
                    heading: 90,
                    speed: 50,
                    accuracy: 10
                });
            });
        });

        it('should accept location update during ACCEPTED ride', (done) => {
            const mockRide = {
                id: 'ride-accepted',
                userId: 'passenger-456',
                driverId: 'driver-123',
                status: RideStatus.ACCEPTED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            driverClient = Client(`http://localhost:${serverPort}`, {
                auth: { token: driverToken }
            });

            driverClient.on('connect', () => {
                driverClient.emit('location:update', {
                    rideId: 'ride-accepted',
                    latitude: 36.75,
                    longitude: 3.05
                });

                // Should not throw error
                setTimeout(() => {
                    driverClient.disconnect();
                    done();
                }, 100);
            });
        });
    });

    describe('Invalid Coordinates', () => {
        it('should reject latitude out of range', (done) => {
            driverClient = Client(`http://localhost:${serverPort}`, {
                auth: { token: driverToken }
            });

            driverClient.on('location:error', (error) => {
                expect(error.code).toBe('INVALID_LOCATION');
                expect(error.message).toMatch(/invalid/i);
                driverClient.disconnect();
                done();
            });

            driverClient.on('connect', () => {
                driverClient.emit('location:update', {
                    rideId: 'ride-123',
                    latitude: 91,  // Invalid
                    longitude: 3.05
                });
            });
        });

        it('should reject longitude out of range', (done) => {
            driverClient = Client(`http://localhost:${serverPort}`, {
                auth: { token: driverToken }
            });

            driverClient.on('location:error', (error) => {
                expect(error.code).toBe('INVALID_LOCATION');
                driverClient.disconnect();
                done();
            });

            driverClient.on('connect', () => {
                driverClient.emit('location:update', {
                    rideId: 'ride-123',
                    latitude: 36.75,
                    longitude: 181  // Invalid
                });
            });
        });
    });

    describe('Authorization', () => {
        it('should reject location update from wrong driver', (done) => {
            const mockRide = {
                id: 'ride-auth-test',
                userId: 'passenger-456',
                driverId: 'other-driver-789',  // Different driver
                status: RideStatus.ONGOING,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            driverClient = Client(`http://localhost:${serverPort}`, {
                auth: { token: driverToken }  // driver-123
            });

            driverClient.on('location:error', (error) => {
                expect(error.code).toBe('UNAUTHORIZED');
                expect(error.message).toMatch(/not the driver/i);
                driverClient.disconnect();
                done();
            });

            driverClient.on('connect', () => {
                driverClient.emit('location:update', {
                    rideId: 'ride-auth-test',
                    latitude: 36.75,
                    longitude: 3.05
                });
            });
        });

        it('should reject location update for non-existent ride', (done) => {
            (db.ride.findUnique as jest.Mock).mockResolvedValue(null);

            driverClient = Client(`http://localhost:${serverPort}`, {
                auth: { token: driverToken }
            });

            driverClient.on('location:error', (error) => {
                expect(error.code).toBe('RIDE_NOT_FOUND');
                driverClient.disconnect();
                done();
            });

            driverClient.on('connect', () => {
                driverClient.emit('location:update', {
                    rideId: 'nonexistent',
                    latitude: 36.75,
                    longitude: 3.05
                });
            });
        });
    });

    describe('Privacy Controls', () => {
        it('should reject location update for COMPLETED ride', (done) => {
            const mockRide = {
                id: 'ride-completed',
                userId: 'passenger-456',
                driverId: 'driver-123',
                status: RideStatus.COMPLETED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            driverClient = Client(`http://localhost:${serverPort}`, {
                auth: { token: driverToken }
            });

            driverClient.on('location:error', (error) => {
                expect(error.code).toBe('INVALID_RIDE_STATUS');
                expect(error.message).toMatch(/only available during active rides/i);
                driverClient.disconnect();
                done();
            });

            driverClient.on('connect', () => {
                driverClient.emit('location:update', {
                    rideId: 'ride-completed',
                    latitude: 36.75,
                    longitude: 3.05
                });
            });
        });

        it('should reject location update for PENDING ride', (done) => {
            const mockRide = {
                id: 'ride-pending',
                userId: 'passenger-456',
                driverId: 'driver-123',
                status: RideStatus.PENDING,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            driverClient = Client(`http://localhost:${serverPort}`, {
                auth: { token: driverToken }
            });

            driverClient.on('location:error', (error) => {
                expect(error.code).toBe('INVALID_RIDE_STATUS');
                driverClient.disconnect();
                done();
            });

            driverClient.on('connect', () => {
                driverClient.emit('location:update', {
                    rideId: 'ride-pending',
                    latitude: 36.75,
                    longitude: 3.05
                });
            });
        });
    });

    describe('Rate Limiting', () => {
        it('should drop updates that are too frequent', (done) => {
            const mockRide = {
                id: 'ride-rate-limit',
                userId: 'passenger-456',
                driverId: 'driver-123',
                status: RideStatus.ONGOING,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            driverClient = Client(`http://localhost:${serverPort}`, {
                auth: { token: driverToken }
            });

            passengerClient = Client(`http://localhost:${serverPort}`, {
                auth: { token: passengerToken }
            });

            let updateCount = 0;

            passengerClient.on('location:updated', () => {
                updateCount++;
            });

            driverClient.on('connect', () => {
                // Send 3 updates rapidly (within 1 second)
                driverClient.emit('location:update', {
                    rideId: 'ride-rate-limit',
                    latitude: 36.75,
                    longitude: 3.05
                });

                setTimeout(() => {
                    driverClient.emit('location:update', {
                        rideId: 'ride-rate-limit',
                        latitude: 36.76,
                        longitude: 3.06
                    });
                }, 100);

                setTimeout(() => {
                    driverClient.emit('location:update', {
                        rideId: 'ride-rate-limit',
                        latitude: 36.77,
                        longitude: 3.07
                    });
                }, 200);

                // Check after 500ms
                setTimeout(() => {
                    // Should only receive 1 update (others dropped)
                    expect(updateCount).toBeLessThanOrEqual(1);
                    driverClient.disconnect();
                    passengerClient.disconnect();
                    done();
                }, 500);
            });
        });
    });
});
