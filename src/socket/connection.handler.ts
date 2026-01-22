import { Server } from 'socket.io';
import { AuthenticatedSocket } from './auth.middleware';
import { ROOMS } from './events/ride.events';
import { setupLocationHandlers } from './handlers/location.handler';
import { Role } from '@prisma/client';

/**
 * Handle new socket connections
 * - Join appropriate rooms based on user role
 * - Setup heartbeat monitoring
 */
export const handleConnection = (io: Server, socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.userId} (${socket.role})`);

    // Join user-specific room
    socket.join(ROOMS.user(socket.userId!));

    // Drivers join the drivers room to receive new ride notifications
    if (socket.role === Role.DRIVER) {
        socket.join(ROOMS.drivers());
        console.log(`Driver ${socket.userId} joined drivers room`);
    }

    // Setup heartbeat (client should respond to keep connection alive)
    const heartbeatInterval = setInterval(() => {
        socket.emit('heartbeat', { timestamp: Date.now() });
    }, 30000); // Every 30 seconds

    // Handle disconnection
    socket.on('disconnect', () => {
        clearInterval(heartbeatInterval);
        console.log(`User disconnected: ${socket.userId}`);
    });

    // Handle heartbeat response
    socket.on('heartbeat:response', () => {
        // Client is alive, no action needed
    });

    // Setup location tracking handlers
    setupLocationHandlers(io, socket);
};
