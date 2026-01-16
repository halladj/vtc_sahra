import { RideStatus, RideType } from "@prisma/client";
import { db } from "../../utils/db";
import { processDriverCommission, processDriverCancellationPenalty } from "./ride.payment.services";
import { estimateRidePrice } from "./ride.pricing.services";
import { getRideEmitter } from "../../socket";

/**
 * Create a new ride for a passenger
 * Note: Passengers pay with cash directly to driver - no wallet check needed
 * Price is automatically calculated if not provided
 */
export async function createRide(data: {
    userId: string;
    type: RideType;
    originLat: number;
    originLng: number;
    destLat: number;
    destLng: number;
    distanceKm?: number;
    durationMin?: number;
    price?: number;
    seatCount?: number;
    packageWeight?: number;
}) {
    // Calculate price if not provided
    const finalPrice = data.price ?? estimateRidePrice({
        type: data.type,
        ...(data.distanceKm !== undefined && { distanceKm: data.distanceKm }),
        ...(data.durationMin !== undefined && { durationMin: data.durationMin }),
        ...(data.seatCount !== undefined && { seatCount: data.seatCount }),
        ...(data.packageWeight !== undefined && { packageWeight: data.packageWeight }),
        originLat: data.originLat,
        originLng: data.originLng,
        destLat: data.destLat,
        destLng: data.destLng,
    });

    const ride = await db.ride.create({
        data: {
            userId: data.userId,
            type: data.type,
            originLat: data.originLat,
            originLng: data.originLng,
            destLat: data.destLat,
            destLng: data.destLng,
            distanceKm: data.distanceKm ?? null,
            durationMin: data.durationMin ?? null,
            price: finalPrice,
            seatCount: data.seatCount ?? null,
            packageWeight: data.packageWeight ?? null,
            status: RideStatus.PENDING,
        },
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
        },
    });

    // Emit ride:created event to all drivers
    try {
        const emitter = getRideEmitter();
        emitter.emitRideCreated(ride);
    } catch (error) {
        // Socket.IO not initialized yet (e.g., in tests) - silent in test mode
        if (process.env.NODE_ENV !== 'test') {
            console.log('WebSocket not available:', error);
        }
    }

    return ride;
}

/**
 * Find a ride by ID with all related data
 */
export async function findRideById(rideId: string) {
    return db.ride.findUnique({
        where: { id: rideId },
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
            driver: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
            vehicle: true,
            commission: true,
            ratings: true,
        },
    });
}

/**
 * Get all rides for a specific user (passenger)
 */
export async function getRidesForUser(userId: string, status?: RideStatus) {
    return db.ride.findMany({
        where: {
            userId: userId,
            ...(status && { status }),
        },
        include: {
            driver: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
            vehicle: true,
        },
        orderBy: {
            createdAt: "desc",
        },
    });
}

/**
 * Get all current rides for a specific user (rides with ACCEPTED, PENDING, or ONGOING status)
 */
export async function getCurrentRidesForUser(userId: string) {
    return db.ride.findMany({
        where: {
            userId: userId,
            status: {
                in: [RideStatus.ACCEPTED, RideStatus.ONGOING, RideStatus.PENDING],
            },
        },
        include: {
            driver: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
            vehicle: true,
        },
        orderBy: {
            createdAt: "desc",
        },
    });
}

/**
 * Get all rides for a specific driver
 */
export async function getRidesForDriver(driverId: string, status?: RideStatus) {
    return db.ride.findMany({
        where: {
            driverId: driverId,
            ...(status && { status }),
        },
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
            vehicle: true,
        },
        orderBy: {
            createdAt: "desc",
        },
    });
}

/**
 * Get all pending rides (for drivers to accept)
 */
export async function getPendingRides() {
    return db.ride.findMany({
        where: {
            status: RideStatus.PENDING,
        },
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });
}

/**
 * Accept a ride (driver accepts a pending ride)
 */
export async function acceptRide(
    rideId: string,
    driverId: string,
    vehicleId: string
) {
    // First check if the ride is still pending
    const ride = await db.ride.findUnique({
        where: { id: rideId },
    });

    if (!ride) {
        throw new Error("Ride not found");
    }

    if (ride.status !== RideStatus.PENDING) {
        throw new Error("Ride is no longer available");
    }

    // Verify the vehicle belongs to the driver
    const driverProfile = await db.driverProfile.findUnique({
        where: { userId: driverId },
    });

    if (!driverProfile) {
        throw new Error("Driver profile not found");
    }

    const vehicle = await db.vehicle.findUnique({
        where: { id: vehicleId },
    });

    if (!vehicle || vehicle.driverId !== driverProfile.id) {
        throw new Error("Vehicle not found or does not belong to driver");
    }

    // Update the ride
    const updatedRide = await db.ride.update({
        where: { id: rideId },
        data: {
            driverId: driverId,
            vehicleId: vehicleId,
            status: RideStatus.ACCEPTED,
        },
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
            driver: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
            vehicle: true,
        },
    });

    // Emit ride:accepted event
    try {
        const emitter = getRideEmitter();
        emitter.emitRideAccepted(updatedRide);
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.log('WebSocket not available:', error);
        }
    }

    return updatedRide;
}

/**
 * Update ride status
 */
export async function updateRideStatus(
    rideId: string,
    status: RideStatus,
    userId: string
) {
    // Get the ride first to verify ownership
    const ride = await db.ride.findUnique({
        where: { id: rideId },
    });

    if (!ride) {
        throw new Error("Ride not found");
    }

    // Verify the user is either the passenger or the driver
    if (ride.userId !== userId && ride.driverId !== userId) {
        throw new Error("Unauthorized: You are not part of this ride");
    }

    // Business logic for status transitions
    if (status === RideStatus.ONGOING && ride.status !== RideStatus.ACCEPTED) {
        throw new Error("Can only start an accepted ride");
    }

    if (status === RideStatus.COMPLETED && ride.status !== RideStatus.ONGOING) {
        throw new Error("Can only complete an ongoing ride");
    }

    // Update the ride
    const updatedRide = await db.ride.update({
        where: { id: rideId },
        data: { status },
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
            driver: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
            vehicle: true,
        },
    });

    // If ride is completed, charge driver 10% commission
    if (status === RideStatus.COMPLETED && ride.status === RideStatus.ONGOING && ride.driverId) {
        await processDriverCommission(
            rideId,
            ride.driverId,
            ride.price
        );
    }

    // Emit ride:statusUpdated event
    try {
        const emitter = getRideEmitter();
        emitter.emitRideStatusUpdated(updatedRide);
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.log('WebSocket not available:', error);
        }
    }

    return updatedRide;
}

/**
 * Cancel a ride
 */
export async function cancelRide(rideId: string, userId: string) {
    const ride = await db.ride.findUnique({
        where: { id: rideId },
    });

    if (!ride) {
        throw new Error("Ride not found");
    }

    // Verify the user is either the passenger or the driver
    if (ride.userId !== userId && ride.driverId !== userId) {
        throw new Error("Unauthorized: You are not part of this ride");
    }

    // Can't cancel completed rides
    if (ride.status === RideStatus.COMPLETED) {
        throw new Error("Cannot cancel a completed ride");
    }

    // Apply cancellation penalty if driver cancels accepted/ongoing ride
    if (
        ride.driverId === userId &&
        (ride.status === RideStatus.ACCEPTED || ride.status === RideStatus.ONGOING)
    ) {
        await processDriverCancellationPenalty(rideId, ride.driverId, ride.price);
    }

    const cancelledRide = await db.ride.update({
        where: { id: rideId },
        data: { status: RideStatus.CANCELLED },
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
            driver: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
            vehicle: true,
        },
    });

    // Emit ride:cancelled event
    try {
        const emitter = getRideEmitter();
        emitter.emitRideCancelled(cancelledRide);
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.log('WebSocket not available:', error);
        }
    }

    return cancelledRide;
}

/**
 * Update ride details (before it's accepted)
 */
export async function updateRide(
    rideId: string,
    userId: string,
    data: Partial<{
        originLat: number;
        originLng: number;
        destLat: number;
        destLng: number;
        distanceKm: number;
        durationMin: number;
        price: number;
        seatCount: number;
        packageWeight: number;
    }>
) {
    const ride = await db.ride.findUnique({
        where: { id: rideId },
    });

    if (!ride) {
        throw new Error("Ride not found");
    }

    // Only the passenger can update ride details
    if (ride.userId !== userId) {
        throw new Error("Unauthorized: Only the passenger can update ride details");
    }

    // Can only update pending rides
    if (ride.status !== RideStatus.PENDING) {
        throw new Error("Can only update pending rides");
    }

    return db.ride.update({
        where: { id: rideId },
        data,
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    photo: true,
                },
            },
        },
    });
}
