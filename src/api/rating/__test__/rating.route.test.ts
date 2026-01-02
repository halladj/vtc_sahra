import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Role, RideStatus } from "@prisma/client";
import ratingRouter from "../rating.route";
import { db } from "../../../utils/db";

// Mock the rating services
jest.mock("../rating.services", () => ({
    createRating: jest.fn(),
    getRatingByRideId: jest.fn(),
    getDriverRatings: jest.fn(),
    getDriverAverageRating: jest.fn(),
}));

// Mock the database
jest.mock("../../../utils/db", () => ({
    db: {
        ride: {
            findUnique: jest.fn(),
        },
    },
}));

import * as ratingServices from "../rating.services";

// Mock environment
process.env.JWT_ACCESS_SECRET = "testsecret";

const app = express();
app.use(express.json());
app.use("/ratings", ratingRouter);

describe("Rating Routes", () => {
    const passengerPayload = { userId: "passenger-123", role: Role.USER };
    const driverPayload = { userId: "driver-123", role: Role.DRIVER };

    const generateToken = (payload: any) => {
        return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
            expiresIn: "1h",
        });
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("POST /ratings - Create rating", () => {
        it("should create a rating successfully", async () => {
            const mockRating = {
                id: "rating-123",
                rideId: "ride-123",
                fromId: "passenger-123",
                toId: "driver-123",
                score: 5,
                comment: "Great ride!",
            };

            (ratingServices.createRating as jest.Mock).mockResolvedValue(
                mockRating
            );

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/ratings")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    rideId: "ride-123",
                    score: 5,
                    comment: "Great ride!",
                });

            expect(res.status).toBe(201);
            expect(res.body.score).toBe(5);
            expect(res.body.comment).toBe("Great ride!");
            expect(ratingServices.createRating).toHaveBeenCalledWith(
                "ride-123",
                "passenger-123",
                5,
                "Great ride!"
            );
        });

        it("should reject request without rideId", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/ratings")
                .set("Authorization", `Bearer ${token}`)
                .send({ score: 5 });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("rideId is required");
        });

        it("should reject request without score", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/ratings")
                .set("Authorization", `Bearer ${token}`)
                .send({ rideId: "ride-123" });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("score is required");
        });

        it("should return 404 if ride not found", async () => {
            (ratingServices.createRating as jest.Mock).mockRejectedValue(
                new Error("Ride not found")
            );

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/ratings")
                .set("Authorization", `Bearer ${token}`)
                .send({ rideId: "ride-123", score: 5 });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Ride not found");
        });

        it("should return 403 if user is not passenger", async () => {
            (ratingServices.createRating as jest.Mock).mockRejectedValue(
                new Error("Only the passenger can rate the ride")
            );

            const token = generateToken(driverPayload);
            const res = await request(app)
                .post("/ratings")
                .set("Authorization", `Bearer ${token}`)
                .send({ rideId: "ride-123", score: 5 });

            expect(res.status).toBe(403);
        });

        it("should return 409 if ride already rated", async () => {
            (ratingServices.createRating as jest.Mock).mockRejectedValue(
                new Error("Ride already rated")
            );

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/ratings")
                .set("Authorization", `Bearer ${token}`)
                .send({ rideId: "ride-123", score: 5 });

            expect(res.status).toBe(409);
            expect(res.body.error).toBe("Ride already rated");
        });

        it("should return 400 for invalid score", async () => {
            (ratingServices.createRating as jest.Mock).mockRejectedValue(
                new Error("Rating must be between 1 and 5")
            );

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/ratings")
                .set("Authorization", `Bearer ${token}`)
                .send({ rideId: "ride-123", score: 6 });

            expect(res.status).toBe(400);
        });
    });

    describe("GET /ratings/ride/:rideId - Get rating for ride", () => {
        it("should return rating for authorized user", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
            };

            const mockRating = {
                id: "rating-123",
                rideId: "ride-123",
                score: 5,
                comment: "Excellent!",
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (ratingServices.getRatingByRideId as jest.Mock).mockResolvedValue(
                mockRating
            );

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/ratings/ride/ride-123")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.score).toBe(5);
        });

        it("should return 404 if ride not found", async () => {
            (db.ride.findUnique as jest.Mock).mockResolvedValue(null);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/ratings/ride/ride-123")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Ride not found");
        });

        it("should return 403 if user not part of ride", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "other-user",
                driverId: "other-driver",
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/ratings/ride/ride-123")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(403);
        });

        it("should return 404 if rating not found", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (ratingServices.getRatingByRideId as jest.Mock).mockResolvedValue(null);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/ratings/ride/ride-123")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Rating not found");
        });
    });

    describe("GET /ratings/driver/:driverId - Get driver ratings", () => {
        it("should return all ratings for driver", async () => {
            const mockRatings = [
                { id: "rating-1", score: 5, comment: "Great!" },
                { id: "rating-2", score: 4, comment: "Good" },
            ];

            (ratingServices.getDriverRatings as jest.Mock).mockResolvedValue(
                mockRatings
            );

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/ratings/driver/driver-123")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(res.body[0].score).toBe(5);
        });

        it("should return empty array if no ratings", async () => {
            (ratingServices.getDriverRatings as jest.Mock).mockResolvedValue([]);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/ratings/driver/driver-123")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });
    });

    describe("GET /ratings/driver/:driverId/average - Get driver average", () => {
        it("should return driver average rating", async () => {
            const mockAverage = {
                average: 4.5,
                count: 10,
            };

            (ratingServices.getDriverAverageRating as jest.Mock).mockResolvedValue(
                mockAverage
            );

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/ratings/driver/driver-123/average")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.average).toBe(4.5);
            expect(res.body.count).toBe(10);
        });

        it("should return 0 average for driver with no ratings", async () => {
            const mockAverage = {
                average: 0,
                count: 0,
            };

            (ratingServices.getDriverAverageRating as jest.Mock).mockResolvedValue(
                mockAverage
            );

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/ratings/driver/driver-123/average")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.average).toBe(0);
            expect(res.body.count).toBe(0);
        });
    });
});
