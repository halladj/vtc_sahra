import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth.middleware';
import { RIDE_EVENTS, ROOMS } from '../events/ride.events';
import { updateRideStatus } from '../../api/ride/ride.services';
import { RideStatus } from '@prisma/client';

/**
 * Rate limiting map: userId -> timestamp[]
 */
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 10;

/**
 * Check if user has exceeded rate limit
 */
const isRateLimited = (userId: string): boolean => {
    const now = Date.now();
    const timestamps = rateLimitMap.get(userId) || [];

    // Remove timestamps outside the window
    const validTimestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);

    if (validTimestamps.length >= MAX_REQUESTS) {
        return true;
    }

    validTimestamps.push(now);
    rateLimitMap.set(userId, validTimestamps);
    return false;
};

/**
 * Setup ride event handlers for a socket
 */
export const setupRideHandlers = (io: Server, socket: AuthenticatedSocket) => {
    /**
     * Handle ride:updateStatus event from client
     */
    socket.on(
        RIDE_EVENTS.UPDATE_STATUS,
        async (
            data: { rideId: string; status: RideStatus },
            acknowledgment?: (response: any) => void
        ) => {
            try {
                // Rate limiting
                if (isRateLimited(socket.userId!)) {
                    const error = {
                        error: 'Rate limit exceeded. Max 10 requests per minute.',
                        code: 'RATE_LIMIT_EXCEEDED',
                    };
                    if (acknowledgment) acknowledgment(error);
                    socket.emit(RIDE_EVENTS.ERROR, error);
                    return;
                }

                // Validation
                if (!data.rideId || !data.status) {
                    const error = {
                        error: 'Missing required fields: rideId, status',
                        code: 'INVALID_INPUT',
                    };
                    if (acknowledgment) acknowledgment(error);
                    return;
                }

                // Validate status
                if (!Object.values(RideStatus).includes(data.status)) {
                    const error = {
                        error: 'Invalid status value',
                        code: 'INVALID_STATUS',
                    };
                    if (acknowledgment) acknowledgment(error);
                    return;
                }

                // Update ride status (this will also emit WebSocket events)
                const updatedRide = await updateRideStatus(
                    data.rideId,
                    data.status,
                    socket.userId!
                );

                // Send acknowledgment
                if (acknowledgment) {
                    acknowledgment({ success: true, ride: updatedRide });
                }

                // Join ride room if not already joined
                socket.join(ROOMS.ride(data.rideId));

            } catch (error: any) {
                const errorResponse = {
                    error: error.message || 'Failed to update ride status',
                    code: 'UPDATE_FAILED',
                };

                if (acknowledgment) {
                    acknowledgment(errorResponse);
                }

                socket.emit(RIDE_EVENTS.ERROR, errorResponse);
            }
        }
    );

    /**
     * Handle joining a ride room (when ride is accepted)
     */
    socket.on('ride:join', (data: { rideId: string }) => {
        if (data.rideId) {
            socket.join(ROOMS.ride(data.rideId));
        }
    });
};
