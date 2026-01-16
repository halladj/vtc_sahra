import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { RideStatus, RideType, Role } from "@prisma/client";

// Mock the database BEFORE importing the router
jest.mock("../../../utils/db", () => ({
    db: {
        ride: {
            create: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        wallet: {
            update: jest.fn(),
        },
        driverProfile: {
            findUnique: jest.fn(),
        },
        vehicle: {
            findUnique: jest.fn(),
        },
        commission: {
            create: jest.fn(),
        },
    },
}));

// Mock payment services BEFORE importing the router
jest.mock("../ride.payment.services", () => ({
    processDriverCommission: jest.fn(),
    processDriverCancellationPenalty: jest.fn(),
}));

import { db } from "../../../utils/db";
import rideRouter from "../ride.route";
import * as paymentServices from "../ride.payment.services";

// Mock environment
process.env.JWT_ACCESS_SECRET = "testsecret";

const app = express();
app.use(express.json());
app.use("/rides", rideRouter);
app.use((err: any, req: any, res: any, next: any) => {
    res.status(err.status || 500).json({ error: err.message });
});

describe("Ride Routes - Coordinate Based Locations", () => {
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

    describe("POST /rides - Create Ride with Coordinates", () => {
        const validRideData = {
            type: RideType.REGULAR,
            originLat: 36.7538,
            originLng: 3.0588,
            destLat: 36.7650,
            destLng: 3.0700,
        };

        it("should create ride with valid coordinates", async () => {
            const mockRide = {
                id: "ride-123",
                ...validRideData,
                userId: passengerPayload.userId,
                status: RideStatus.PENDING,
                user: { id: passengerPayload.userId, firstName: "John" },
            };

            (db.ride.create as jest.Mock).mockResolvedValue(mockRide);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send(validRideData);

            expect(res.status).toBe(201);
            expect(res.body.id).toBe("ride-123");
            expect(res.body.originLat).toBe(36.7538);
            expect(res.body.destLng).toBe(3.0700);
        });

        it("should reject invalid latitude (out of range)", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send({ ...validRideData, originLat: 95 }); // Invalid: > 90

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Latitude must be between");
        });

        it("should reject invalid longitude (out of range)", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send({ ...validRideData, destLng: 200 }); // Invalid: > 180

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Longitude must be between");
        });

        it("should reject missing coordinates", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send({ type: RideType.REGULAR });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Missing required fields");
        });

        it("should accept edge case coordinates", async () => {
            const edgeCaseData = {
                type: RideType.REGULAR,
                originLat: -90, // Min valid
                originLng: -180, // Min valid
                destLat: 90,   // Max valid
                destLng: 180,  // Max valid
            };

            const mockRide = {
                id: "ride-edge",
                ...edgeCaseData,
                userId: passengerPayload.userId,
                status: RideStatus.PENDING,
            };

            (db.ride.create as jest.Mock).mockResolvedValue(mockRide);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send(edgeCaseData);

            expect(res.status).toBe(201);
        });
    });

    describe("Driver Commission (10% completion, 5% cancellation)", () => {
        it("should charge 10% commission on ride completion", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
                status: RideStatus.ONGOING,
                price: 100000,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.ride.update as jest.Mock).mockResolvedValue({
                ...mockRide,
                status: RideStatus.COMPLETED,
            });
            (paymentServices.processDriverCommission as jest.Mock).mockResolvedValue({
                driverBalance: 90000,
                commissionAmount: 10000,
            });

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .put("/rides/ride-123/status")
                .set("Authorization", `Bearer ${token}`)
                .send({ status: RideStatus.COMPLETED });

            expect(res.status).toBe(200);
            expect(paymentServices.processDriverCommission).toHaveBeenCalledWith(
                "ride-123",
                "driver-123",
                100000
            );
        });

        it("should charge 5% penalty when driver cancels", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
                status: RideStatus.ACCEPTED,
                price: 100000,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.ride.update as jest.Mock).mockResolvedValue({
                ...mockRide,
                status: RideStatus.CANCELLED,
            });
            (paymentServices.processDriverCancellationPenalty as jest.Mock).mockResolvedValue({
                penaltyCharged: 5000,
                driverBalance: 95000,
            });

            const token = generateToken(driverPayload);
            const res = await request(app)
                .put("/rides/ride-123/cancel")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(paymentServices.processDriverCancellationPenalty).toHaveBeenCalledWith(
                "ride-123",
                "driver-123",
                100000
            );
        });

        it("should NOT charge when passenger cancels", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: "driver-123",
                status: RideStatus.ACCEPTED,
                price: 100000,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.ride.update as jest.Mock).mockResolvedValue({
                ...mockRide,
                status: RideStatus.CANCELLED,
            });

            const token = generateToken(passengerPayload);
            await request(app)
                .put("/rides/ride-123/cancel")
                .set("Authorization", `Bearer ${token}`);

            expect(paymentServices.processDriverCancellationPenalty).not.toHaveBeenCalled();
        });
    });

    describe("Ride Updates & Estimation", () => {
        it("should estimate price with coordinates", async () => {
            const res = await request(app)
                .post("/rides/estimate")
                .send({
                    type: RideType.REGULAR,
                    originLat: 36.7538,
                    originLng: 3.0588,
                    destLat: 36.7650,
                    destLng: 3.0700,
                });

            expect(res.status).toBe(200);
            expect(res.body.estimatedPrice).toBeDefined();
            expect(res.body.breakdown).toBeDefined();
        });

        it("should update ride details with coordinates", async () => {
            const testUserId = passengerPayload.userId; // Define testUserId here
            const token = generateToken(passengerPayload); // Define token here

            const mockRide = {
                id: "ride-update-123",
                userId: testUserId,
                status: RideStatus.PENDING, // Added status
                originLat: 36.7, // Added originLat
                originLng: 3.0, // Added originLng
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.ride.update as jest.Mock).mockResolvedValue({
                ...mockRide,
                originLat: 36.8,
                originLng: 3.1, // Added originLng update
            });

            const res = await request(app)
                .patch(`/api/v1/rides/ride-update-123`)
                .set("Authorization", `Bearer ${token}`)
                .send({
                    originLat: 36.8,
                    originLng: 3.1, // Added originLng in send
                });

            expect(res.status).toBe(200);
            expect(res.body.originLat).toBe(36.8);
        });
    });

    describe("GET /rides/current - Get Latest Current Ride", () => {
        it("should return the newest PENDING or ACCEPTED ride", async () => {
            const testUserId = passengerPayload.userId; // Define testUserId here
            const token = generateToken(passengerPayload); // Define token here

            const olderRide = {
                id: "ride-old-123",
                userId: testUserId,
                status: RideStatus.PENDING,
                createdAt: new Date("2024-01-01T10:00:00Z"),
                originLat: 36.75,
                originLng: 3.05,
                destLat: 36.76,
                destLng: 3.06,
                price: 500,
            };

            const newerRide = {
                id: "ride-new-456",
                userId: testUserId,
                status: RideStatus.ACCEPTED,
                createdAt: new Date("2024-01-01T11:00:00Z"), // 1 hour later
                originLat: 36.77,
                originLng: 3.07,
                destLat: 36.78,
                destLng: 3.08,
                price: 600,
                driver: {
                    id: "driver-123",
                    firstName: "John",
                    lastName: "Doe",
                    phoneNumber: "+213123456789",
                    photo: null,
                },
                vehicle: null,
            };

            // Mock returns the newer ride (findFirst with desc order)
            (db.ride.findFirst as jest.Mock).mockResolvedValue(newerRide);

            const res = await request(app)
                .get("/rides/current")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toBeDefined();
            expect(res.body.id).toBe("ride-new-456");
            expect(res.body.status).toBe(RideStatus.ACCEPTED);
            expect(db.ride.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        userId: testUserId,
                        status: { in: [RideStatus.PENDING, RideStatus.ACCEPTED] }
                    },
                    orderBy: { createdAt: "desc" }
                })
            );
        });

        it("should return null when no current rides exist", async () => {
            const testUserId = passengerPayload.userId; // Define testUserId here
            const token = generateToken(passengerPayload); // Define token here

            (db.ride.findFirst as jest.Mock).mockResolvedValue(null);

            const res = await request(app)
                .get("/rides/current")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toBeNull();
        });
    });

    describe("GET /rides/user/current - Get Current Rides", () => {
        it("should return current rides (ACCEPTED and ONGOING) for authenticated user", async () => {
            const mockCurrentRides = [
                {
                    id: "ride-1",
                    userId: passengerPayload.userId,
                    status: RideStatus.ACCEPTED,
                    driver: { id: "driver-1", firstName: "John" },
                    vehicle: { id: "vehicle-1", model: "Toyota Camry" },
                },
                {
                    id: "ride-2",
                    userId: passengerPayload.userId,
                    status: RideStatus.ONGOING,
                    driver: { id: "driver-2", firstName: "Jane" },
                    vehicle: { id: "vehicle-2", model: "Honda Civic" },
                },
            ];

            (db.ride.findMany as jest.Mock).mockResolvedValue(mockCurrentRides);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/user/current")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(res.body[0].status).toBe(RideStatus.ACCEPTED);
            expect(res.body[1].status).toBe(RideStatus.ONGOING);
        });

        it("should return empty array when user has no current rides", async () => {
            (db.ride.findMany as jest.Mock).mockResolvedValue([]);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/user/current")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("should require authentication", async () => {
            const res = await request(app).get("/rides/user/current");

            expect(res.status).toBeGreaterThanOrEqual(400);
        });
    });
});
