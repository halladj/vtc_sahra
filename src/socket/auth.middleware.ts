import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

export interface AuthenticatedSocket extends Socket {
    userId?: string;
    role?: string;
}

/**
 * Socket.IO middleware to authenticate connections using JWT
 */
export const socketAuthMiddleware = async (
    socket: AuthenticatedSocket,
    next: (err?: Error) => void
) => {
    try {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error('Authentication token required'));
        }

        // Remove 'Bearer ' prefix if present
        const tokenValue = token.startsWith('Bearer ')
            ? token.slice(7)
            : token;

        // Verify JWT token
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret) {
            return next(new Error('JWT secret not configured'));
        }

        const decoded = jwt.verify(tokenValue, secret) as {
            userId: string;
            role: string;
        };

        // Attach user info to socket
        socket.userId = decoded.userId;
        socket.role = decoded.role;

        next();
    } catch (error) {
        next(new Error('Invalid authentication token'));
    }
};
