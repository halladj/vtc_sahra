import { Server as HTTPServer } from 'http';
import { Server, ServerOptions } from 'socket.io';
import { socketAuthMiddleware } from './auth.middleware';
import { handleConnection } from './connection.handler';
import { setupRideHandlers } from './handlers/ride.handler';
import { RideEmitter } from './emitters/ride.emitter';

let io: Server;
let rideEmitter: RideEmitter;

/**
 * Initialize Socket.IO server
 */
export const initializeSocket = (httpServer: HTTPServer): Server => {
    const options: Partial<ServerOptions> = {
        cors: {
            origin: process.env.CORS_ORIGIN || '*',
            methods: ['GET', 'POST'],
            credentials: true,
        },
    };

    io = new Server(httpServer, options);

    // Create ride emitter instance
    rideEmitter = new RideEmitter(io);

    // Setup authentication middleware
    io.use(socketAuthMiddleware);

    // Handle connections
    io.on('connection', (socket) => {
        handleConnection(io, socket);
        setupRideHandlers(io, socket);
    });

    console.log('✅ Socket.IO server initialized');

    return io;
};

/**
 * Get Socket.IO server instance
 */
export const getIO = (): Server => {
    if (!io) {
        throw new Error('Socket.IO not initialized. Call initializeSocket first.');
    }
    return io;
};

/**
 * Get ride emitter instance
 */
export const getRideEmitter = (): RideEmitter => {
    if (!rideEmitter) {
        throw new Error('Socket.IO not initialized. Call initializeSocket first.');
    }
    return rideEmitter;
};
