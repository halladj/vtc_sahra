import express, { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { isAuthenticated, requireRole } from "../../middlewares/middlewares";
import {
    createRide,
    findRideById,
    getRidesForUser,
    getRidesForDriver,
    getPendingRides,
    acceptRide,
    updateRideStatus,
    cancelRide,
    updateRide,
} from "./ride.services";
import { estimateRidePrice, getRidePriceBreakdown } from "./ride.pricing.services";
import { Role, RideStatus, RideType } from "@prisma/client";

const router = express.Router();

interface AuthenticatedRequest extends Request {
    payload?: JwtPayload;
}

/**
 * POST /rides/estimate - Estimate price for a ride (anyone can call this)
 */
router.post(
    "/estimate",
    async (req: Request, res: Response, next: any) => {
        try {
            const {
                type,
                distanceKm,
                durationMin,
                seatCount,
                packageWeight,
                origin,
                destination,
            }: {
                type: RideType;
                distanceKm?: number;
                durationMin?: number;
                seatCount?: number;
                packageWeight?: number;
                origin?: string;
                destination?: string;
            } = req.body;

            // Validation
            if (!type) {
                return res.status(400).json({
                    error: "Missing required field: type",
                });
            }

            // Get price estimation
            const estimatedPrice = estimateRidePrice({
                type,
                ...(distanceKm !== undefined && { distanceKm }),
                ...(durationMin !== undefined && { durationMin }),
                ...(seatCount !== undefined && { seatCount }),
                ...(packageWeight !== undefined && { packageWeight }),
                ...(origin !== undefined && { origin }),
                ...(destination !== undefined && { destination }),
            });

            // Get detailed breakdown
            const breakdown = getRidePriceBreakdown({
                type,
                ...(distanceKm !== undefined && { distanceKm }),
                ...(durationMin !== undefined && { durationMin }),
                ...(seatCount !== undefined && { seatCount }),
                ...(packageWeight !== undefined && { packageWeight }),
                ...(origin !== undefined && { origin }),
                ...(destination !== undefined && { destination }),
            });

            res.json({
                estimatedPrice,
                breakdown,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * POST /rides - Create a new ride (passengers only)
 */
router.post(
    "/",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { userId } = req.payload!;

            const {
                type,
                origin,
                destination,
                distanceKm,
                durationMin,
                price,
                seatCount,
                packageWeight,
            }: {
                type: RideType;
                origin: string;
                destination: string;
                distanceKm?: number;
                durationMin?: number;
                price: number;
                seatCount?: number;
                packageWeight?: number;
            } = req.body;

            // Validation
            if (!type || !origin || !destination || price === undefined) {
                return res.status(400).json({
                    error: "Missing required fields: type, origin, destination, price",
                });
            }

            // Type-specific validation
            if (type === RideType.SEAT_RESERVE && !seatCount) {
                return res.status(400).json({
                    error: "seatCount is required for SEAT_RESERVE rides",
                });
            }

            if (type === RideType.DELIVERY && !packageWeight) {
                return res.status(400).json({
                    error: "packageWeight is required for DELIVERY rides",
                });
            }

            const ride = await createRide({
                userId,
                type,
                origin,
                destination,
                price,
                ...(distanceKm !== undefined && { distanceKm }),
                ...(durationMin !== undefined && { durationMin }),
                ...(seatCount !== undefined && { seatCount }),
                ...(packageWeight !== undefined && { packageWeight }),
            });

            res.status(201).json(ride);
        } catch (error: any) {
            // Handle insufficient balance error
            if (error.message === "Insufficient balance to create ride") {
                return res.status(402).json({
                    error: error.message,
                    code: "INSUFFICIENT_BALANCE"
                });
            }
            next(error);
        }
    }
);

/**
 * GET /rides/pending - Get all pending rides (drivers only)
 */
router.get(
    "/pending",
    isAuthenticated,
    requireRole(Role.DRIVER),
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const rides = await getPendingRides();
            res.json(rides);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /rides/user - Get all rides for the current user (passenger)
 */
router.get(
    "/user",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { userId } = req.payload!;
            const { status } = req.query;

            const rides = await getRidesForUser(
                userId,
                status as RideStatus | undefined
            );
            res.json(rides);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /rides/driver - Get all rides for the current driver
 */
router.get(
    "/driver",
    isAuthenticated,
    requireRole(Role.DRIVER),
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { userId } = req.payload!;
            const { status } = req.query;

            const rides = await getRidesForDriver(
                userId,
                status as RideStatus | undefined
            );
            res.json(rides);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /rides/:rideId - Get ride details by ID
 */
router.get(
    "/:rideId",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { rideId } = req.params;
            const { userId } = req.payload!;

            if (!rideId) {
                return res.status(400).json({ error: "rideId is required" });
            }

            const ride = await findRideById(rideId);

            if (!ride) {
                return res.status(404).json({ error: "Ride not found" });
            }

            // Verify the user is part of this ride
            if (ride.userId !== userId && ride.driverId !== userId) {
                return res
                    .status(403)
                    .json({ error: "Unauthorized: You are not part of this ride" });
            }

            res.json(ride);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * POST /rides/:rideId/accept - Accept a ride (drivers only)
 */
router.post(
    "/:rideId/accept",
    isAuthenticated,
    requireRole(Role.DRIVER),
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { rideId } = req.params;
            const { userId } = req.payload!;
            const { vehicleId } = req.body;

            if (!rideId) {
                return res.status(400).json({ error: "rideId is required" });
            }

            if (!vehicleId) {
                return res.status(400).json({ error: "vehicleId is required" });
            }

            const ride = await acceptRide(rideId, userId, vehicleId);
            res.json(ride);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * PUT /rides/:rideId/status - Update ride status
 */
router.put(
    "/:rideId/status",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { rideId } = req.params;
            const { userId } = req.payload!;
            const { status } = req.body;

            if (!rideId) {
                return res.status(400).json({ error: "rideId is required" });
            }

            if (!status) {
                return res.status(400).json({ error: "status is required" });
            }

            // Validate status
            if (!Object.values(RideStatus).includes(status)) {
                return res.status(400).json({ error: "Invalid status value" });
            }

            const ride = await updateRideStatus(rideId, status, userId);
            res.json(ride);
        } catch (error: any) {
            // Handle insufficient balance error
            if (error.message === "Insufficient balance to complete ride") {
                return res.status(402).json({
                    error: error.message,
                    code: "INSUFFICIENT_BALANCE"
                });
            }
            next(error);
        }
    }
);

/**
 * PUT /rides/:rideId/cancel - Cancel a ride
 */
router.put(
    "/:rideId/cancel",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { rideId } = req.params;
            const { userId } = req.payload!;

            if (!rideId) {
                return res.status(400).json({ error: "rideId is required" });
            }

            const ride = await cancelRide(rideId, userId);
            res.json(ride);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * PUT /rides/:rideId - Update ride details (passengers only, pending rides only)
 */
router.put(
    "/:rideId",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { rideId } = req.params;
            const { userId } = req.payload!;

            if (!rideId) {
                return res.status(400).json({ error: "rideId is required" });
            }

            const {
                origin,
                destination,
                distanceKm,
                durationMin,
                price,
                seatCount,
                packageWeight,
            } = req.body;

            const ride = await updateRide(rideId, userId, {
                origin,
                destination,
                distanceKm,
                durationMin,
                price,
                seatCount,
                packageWeight,
            });

            res.json(ride);
        } catch (error) {
            next(error);
        }
    }
);

export = router;
