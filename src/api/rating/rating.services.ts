import { RideStatus } from "@prisma/client";
import { db } from "../../utils/db";

/**
 * Create a rating for a completed ride
 */
export async function createRating(
    rideId: string,
    userId: string,
    score: number,
    comment?: string
) {
    // 1. Validate ride exists and is completed
    const ride = await db.ride.findUnique({
        where: { id: rideId },
        include: { driver: true },
    });

    if (!ride) {
        throw new Error("Ride not found");
    }

    if (ride.status !== RideStatus.COMPLETED) {
        throw new Error("Can only rate completed rides");
    }

    if (!ride.driverId) {
        throw new Error("Ride has no driver to rate");
    }

    // 2. Validate user is the passenger
    if (ride.userId !== userId) {
        throw new Error("Only the passenger can rate the ride");
    }

    // 3. Check if already rated
    const existing = await db.rating.findFirst({
        where: { rideId, fromId: userId },
    });

    if (existing) {
        throw new Error("Ride already rated");
    }

    // 4. Validate score value
    if (score < 1 || score > 5) {
        throw new Error("Rating must be between 1 and 5");
    }

    // 5. Validate comment length if provided
    if (comment && comment.length > 500) {
        throw new Error("Comment must be 500 characters or less");
    }

    // 6. Create rating
    return db.rating.create({
        data: {
            rideId,
            fromId: userId,
            toId: ride.driverId,
            score,
            comment: comment || null,
        },
        include: {
            ride: {
                select: {
                    id: true,
                    origin: true,
                    destination: true,
                    createdAt: true,
                },
            },
            from: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                },
            },
            to: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                },
            },
        },
    });
}

/**
 * Get rating for a specific ride
 */
export async function getRatingByRideId(rideId: string) {
    return db.rating.findFirst({
        where: { rideId },
        include: {
            from: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                },
            },
            to: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                },
            },
        },
    });
}

/**
 * Get all ratings for a driver
 */
export async function getDriverRatings(driverId: string) {
    return db.rating.findMany({
        where: { toId: driverId },
        include: {
            ride: {
                select: {
                    id: true,
                    origin: true,
                    destination: true,
                    createdAt: true,
                },
            },
            from: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                },
            },
        },
        orderBy: {
            id: "desc",
        },
    });
}

/**
 * Calculate driver's average rating
 */
export async function getDriverAverageRating(driverId: string) {
    const ratings = await db.rating.findMany({
        where: { toId: driverId },
        select: { score: true },
    });

    if (ratings.length === 0) {
        return {
            average: 0,
            count: 0,
        };
    }

    const sum = ratings.reduce((acc, r) => acc + r.score, 0);
    const average = sum / ratings.length;

    return {
        average: Math.round(average * 10) / 10, // Round to 1 decimal
        count: ratings.length,
    };
}

/**
 * Validate if user can rate a ride
 */
export async function validateRating(rideId: string, userId: string) {
    const ride = await db.ride.findUnique({
        where: { id: rideId },
    });

    if (!ride) {
        return {
            valid: false,
            message: "Ride not found",
        };
    }

    if (ride.status !== RideStatus.COMPLETED) {
        return {
            valid: false,
            message: "Can only rate completed rides",
        };
    }

    if (ride.userId !== userId) {
        return {
            valid: false,
            message: "Only the passenger can rate the ride",
        };
    }

    const existing = await db.rating.findFirst({
        where: { rideId, fromId: userId },
    });

    if (existing) {
        return {
            valid: false,
            message: "Ride already rated",
        };
    }

    return {
        valid: true,
    };
}
