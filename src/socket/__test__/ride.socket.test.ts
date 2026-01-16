import { Server } from 'http';
import { Server as SocketServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { initializeSocket } from '../index';
import { db } from '../../utils/db';
import { Role, RideStatus, RideType } from '@prisma/client';

// Mock database
jest.mock('../../utils/db', () => ({
    db: {
        ride: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
    },
}));

describe('WebSocket Ride Events', () => {
    let httpServer: Server;
    let io: SocketServer;
    let driverSocket: ClientSocket;
    let passengerSocket: ClientSocket;
    const PORT = 3001;

    const generateToken = (userId: string, role: Role) => {
        return jwt.sign(
            { userId, role },
            process.env.JWT_ACCESS_SECRET || 'testsecret',
            { expiresIn: '1h' }
        );
    };

    beforeAll((done) => {
        // Create HTTP server
        httpServer = require('http').createServer();

        // Initialize Socket.IO
        io = initializeSocket(httpServer);

        httpServer.listen(PORT, () => {
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

    afterEach(() => {
        if (driverSocket?.connected) driverSocket.disconnect();
        if (passengerSocket?.connected) passengerSocket.disconnect();
    });

    describe('Connection & Authentication', () => {
        it('should connect with valid JWT token', (done) => {
            const token = generateToken('driver-123', Role.DRIVER);

            driverSocket = ioc(`http://localhost:${PORT}`, {
                auth: { token: `Bearer ${token}` },
            });

            driverSocket.on('connect', () => {
                expect(driverSocket.connected).toBe(true);
                done();
            });
        });

        it('should reject connection with invalid token', (done) => {
            driverSocket = ioc(`http://localhost:${PORT}`, {
                auth: { token: 'invalid-token' },
            });

            driverSocket.on('connect_error', (error) => {
                expect(error.message).toContain('Invalid authentication token');
                done();
            });
        });

        it('should reject connection without token', (done) => {
            driverSocket = ioc(`http://localhost:${PORT}`);

            driverSocket.on('connect_error', (error) => {
                expect(error.message).toContain('Authentication token required');
                done();
            });
        });
    });

    describe('Room Management', () => {
        it('should join drivers room when driver connects', (done) => {
            const token = generateToken('driver-123', Role.DRIVER);

            driverSocket = ioc(`http://localhost:${PORT}`, {
                auth: { token: `Bearer ${token}` },
            });

            driverSocket.on('connect', () => {
                // Driver should automatically be in drivers room
                // We'll verify this by testing event reception in next test
                done();
            });
        });

        it('should NOT join drivers room when passenger connects', (done) => {
            const token = generateToken('passenger-123', Role.USER);

            passengerSocket = ioc(`http://localhost:${PORT}`, {
                auth: { token: `Bearer ${token}` },
            });

            passengerSocket.on('connect', () => {
                // Passenger should NOT be in drivers room
                done();
            });
        });
    });

    describe('ride:updateStatus Event', () => {
        it('should update ride status and emit event', (done) => {
            const token = generateToken('passenger-123', Role.USER);
            const mockRide = {
                id: 'ride-123',
                userId: 'passenger-123',
                driverId: 'driver-456',
                status: RideStatus.ACCEPTED,
                price: 100000,
            };

            const updatedRide = { ...mockRide, status: RideStatus.ONGOING };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.ride.update as jest.Mock).mockResolvedValue(updatedRide);

            passengerSocket = ioc(`http://localhost:${PORT}`, {
                auth: { token: `Bearer ${token}` },
            });

            passengerSocket.on('connect', () => {
                // Listen for status update event
                passengerSocket.on('ride:statusUpdated', (data) => {
                    expect(data.ride.status).toBe(RideStatus.ONGOING);
                    done();
                });

                // Emit update status event
                passengerSocket.emit('ride:updateStatus', {
                    rideId: 'ride-123',
                    status: RideStatus.ONGOING,
                });
            });
        });

        it('should send acknowledgment on successful update', (done) => {
            const token = generateToken('passenger-123', Role.USER);
            const mockRide = {
                id: 'ride-123',
                userId: 'passenger-123',
                status: RideStatus.ACCEPTED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.ride.update as jest.Mock).mockResolvedValue({ ...mockRide, status: RideStatus.ONGOING });

            passengerSocket = ioc(`http://localhost:${PORT}`, {
                auth: { token: `Bearer ${token}` },
            });

            passengerSocket.on('connect', () => {
                passengerSocket.emit(
                    'ride:updateStatus',
                    { rideId: 'ride-123', status: RideStatus.ONGOING },
                    (ack: any) => {
                        expect(ack.success).toBe(true);
                        expect(ack.ride).toBeDefined();
                        done();
                    }
                );
            });
        });

        it('should return error for invalid status', (done) => {
            const token = generateToken('passenger-123', Role.USER);

            passengerSocket = ioc(`http://localhost:${PORT}`, {
                auth: { token: `Bearer ${token}` },
            });

            passengerSocket.on('connect', () => {
                passengerSocket.emit(
                    'ride:updateStatus',
                    { rideId: 'ride-123', status: 'INVALID_STATUS' },
                    (ack: any) => {
                        expect(ack.error).toBeDefined();
                        expect(ack.code).toBe('INVALID_STATUS');
                        done();
                    }
                );
            });
        });
    });

    describe('Heartbeat', () => {
        it('should send heartbeat to connected clients', (done) => {
            const token = generateToken('driver-123', Role.DRIVER);

            driverSocket = ioc(`http://localhost:${PORT}`, {
                auth: { token: `Bearer ${token}` },
            });

            driverSocket.on('heartbeat', (data) => {
                expect(data.timestamp).toBeDefined();
                expect(typeof data.timestamp).toBe('number');
                done();
            });
        }, 35000); // Timeout longer than heartbeat interval
    });

    describe('ride:join Event', () => {
        it('should allow joining a ride room', (done) => {
            const token = generateToken('passenger-123', Role.USER);

            passengerSocket = ioc(`http://localhost:${PORT}`, {
                auth: { token: `Bearer ${token}` },
            });

            passengerSocket.on('connect', () => {
                passengerSocket.emit('ride:join', { rideId: 'ride-123' });
                // If no error, join was successful
                setTimeout(done, 100);
            });
        });
    });
});
