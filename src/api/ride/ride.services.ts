import { RideStatus, RideType } from "@prisma/client";
import { db } from "../../utils/db";
import { processDriverCommission, processDriverCancellationPenalty } from "./ride.payment.services";
import { estimateRidePrice } from "./ride.pricing.services";
import { getRideEmitter } from "../../socket";
import { UnauthorizedError, NotFoundError, BadRequestError } from "../../utils/errors";

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
    // Check if user already has an active ride
    const existingActiveRide = await db.ride.findFirst({
        where: {
            userId: data.userId,
            status: {
                in: [RideStatus.PENDING, RideStatus.ACCEPTED, RideStatus.ONGOING]
            }
        },
        select: {
            id: true,
            status: true
        }
    });

    if (existingActiveRide) {
        throw new Error(`You already have an active ride (${existingActiveRide.status}). Please complete or cancel it before creating a new one.`);
    }

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
 * Get the current (active) ride for a user
 * Returns the latest PENDING, ACCEPTED, or ONGOING ride
 */
export async function getCurrentRide(userId: string) {
    return db.ride.findFirst({
        where: {
            userId: userId,
            status: {
                in: [RideStatus.PENDING, RideStatus.ACCEPTED, RideStatus.ONGOING]
            }
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
 * Get the current (active) ride for a driver
 * Returns the latest ACCEPTED or ONGOING ride
 * Note: PENDING rides are not included as driver hasn't accepted them yet
 */
export async function getCurrentRideForDriver(driverId: string) {
    return db.ride.findFirst({
        where: {
            driverId: driverId,
            status: {
                in: [RideStatus.ACCEPTED, RideStatus.ONGOING]
            }
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
        throw new NotFoundError("Ride not found");
    }

    if (ride.status !== RideStatus.PENDING) {
        throw new Error("Ride is no longer available");
    }

    // NEW: Check if driver has sufficient balance (10% of ride price for commission)
    const driverWallet = await db.wallet.findUnique({
        where: { userId: driverId }
    });

    if (!driverWallet) {
        throw new BadRequestError("Driver wallet not found. Please contact support.");
    }

    const minimumBalance = ride.price * 0.10; // 10% for potential commission

    if (driverWallet.balance < minimumBalance) {
        throw new BadRequestError(
            `Insufficient balance. Minimum ${minimumBalance.toLocaleString()} DA required to accept this ride. Current balance: ${driverWallet.balance.toLocaleString()} DA.`
        );
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
        throw new NotFoundError("Ride not found");
    }

    // Verify the user is either the passenger or the driver
    if (ride.userId !== userId && ride.driverId !== userId) {
        throw new UnauthorizedError("You are not authorized to update this ride");
    }

    // Business logic for status transitions
    if (status === RideStatus.ONGOING && ride.status !== RideStatus.ACCEPTED) {
        throw new BadRequestError("Can only start an accepted ride");
    }

    if (status === RideStatus.COMPLETED && ride.status !== RideStatus.ONGOING) {
        throw new BadRequestError("Can only complete an ongoing ride");
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
        throw new NotFoundError("Ride not found");
    }

    // Verify the user is either the passenger or the driver
    if (ride.userId !== userId && ride.driverId !== userId) {
        throw new UnauthorizedError("You are not authorized to update this ride");
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

    // Determine new status and data based on who cancelled and current status
    let newStatus: RideStatus = RideStatus.CANCELLED;
    let updateData: any = { status: newStatus };

    // ✅ SPECIAL CASE: Driver cancels ACCEPTED ride → Return to PENDING for auto-match
    if (ride.driverId === userId && ride.status === RideStatus.ACCEPTED) {
        newStatus = RideStatus.PENDING;
        updateData = {
            status: newStatus,
            driverId: null,      // Clear driver so other drivers can accept
            vehicleId: null,     // Clear vehicle assignment
        };
    }

    const updatedRide = await db.ride.update({
        where: { id: rideId },
        data: updateData,
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

    // Emit appropriate WebSocket events
    try {
        const emitter = getRideEmitter();

        if (newStatus === RideStatus.PENDING) {
            // ✅ Driver cancelled ACCEPTED ride → Special events
            console.log(`📡 Broadcasting driver cancel (ACCEPTED → PENDING): ${updatedRide.id}`);

            // 1. Notify passenger that driver cancelled (but ride is being re-matched)
            emitter.emitDriverCancelled(updatedRide);

            // 2. Re-broadcast to all available drivers for re-matching
            emitter.emitRideCreated(updatedRide);

        } else {
            // ✅ Regular cancellation (ONGOING → CANCELLED or passenger cancel)
            console.log(`📡 Broadcasting ride cancel (${ride.status} → CANCELLED): ${updatedRide.id}`);
            console.log(`   - Passenger: ${updatedRide.userId}`);
            console.log(`   - Driver: ${updatedRide.driverId}`);
            emitter.emitRideCancelled(updatedRide);
        }
    } catch (error) {
        console.error('❌ WebSocket broadcast failed:', error);
        if (process.env.NODE_ENV !== 'test') {
            console.log('WebSocket not available:', error);
        }
    }

    return updatedRide;
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
        throw new NotFoundError("Ride not found");
    }

    // Only the passenger can update ride details
    if (ride.userId !== userId) {
        throw new UnauthorizedError("Only the passenger can update ride details");
    }

    // Can only update pending rides
    if (ride.status !== RideStatus.PENDING) {
        throw new BadRequestError("Can only update pending rides");
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
