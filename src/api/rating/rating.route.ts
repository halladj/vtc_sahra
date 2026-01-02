import express, { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { isAuthenticated } from "../../middlewares/middlewares";
import {
    createRating,
    getRatingByRideId,
    getDriverRatings,
    getDriverAverageRating,
} from "./rating.services";

const router = express.Router();

interface AuthenticatedRequest extends Request {
    payload?: JwtPayload;
}

/**
 * POST /ratings - Create a rating for a completed ride
 */
router.post(
    "/",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { userId } = req.payload!;
            const { rideId, score, comment } = req.body;

            if (!rideId) {
                return res.status(400).json({ error: "rideId is required" });
            }

            if (!score || typeof score !== "number") {
                return res.status(400).json({
                    error: "score is required and must be a number",
                });
            }

            const rating = await createRating(rideId, userId, score, comment);

            res.status(201).json(rating);
        } catch (error: any) {
            if (
                error.message === "Ride not found" ||
                error.message === "Ride has no driver to rate"
            ) {
                return res.status(404).json({ error: error.message });
            }

            if (
                error.message === "Only the passenger can rate the ride" ||
                error.message === "Can only rate completed rides"
            ) {
                return res.status(403).json({ error: error.message });
            }

            if (error.message === "Ride already rated") {
                return res.status(409).json({ error: error.message });
            }

            if (
                error.message === "Rating must be between 1 and 5" ||
                error.message === "Comment must be 500 characters or less"
            ) {
                return res.status(400).json({ error: error.message });
            }

            next(error);
        }
    }
);

/**
 * GET /ratings/ride/:rideId - Get rating for a specific ride
 */
router.get(
    "/ride/:rideId",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { rideId } = req.params;
            const { userId } = req.payload!;

            if (!rideId) {
                return res.status(400).json({ error: "rideId is required" });
            }

            // Verify user is part of the ride
            const ride = await require("../../utils/db").db.ride.findUnique({
                where: { id: rideId },
            });

            if (!ride) {
                return res.status(404).json({ error: "Ride not found" });
            }

            if (ride.userId !== userId && ride.driverId !== userId) {
                return res.status(403).json({
                    error: "You are not authorized to view this rating",
                });
            }

            const rating = await getRatingByRideId(rideId);

            if (!rating) {
                return res.status(404).json({ error: "Rating not found" });
            }

            res.json(rating);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /ratings/driver/:driverId - Get all ratings for a driver
 */
router.get(
    "/driver/:driverId",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { driverId } = req.params;

            if (!driverId) {
                return res.status(400).json({ error: "driverId is required" });
            }

            const ratings = await getDriverRatings(driverId);

            res.json(ratings);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /ratings/driver/:driverId/average - Get driver's average rating
 */
router.get(
    "/driver/:driverId/average",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { driverId } = req.params;

            if (!driverId) {
                return res.status(400).json({ error: "driverId is required" });
            }

            const average = await getDriverAverageRating(driverId);

            res.json(average);
        } catch (error) {
            next(error);
        }
    }
);

export = router;
