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
            getCurrentRideForDriver: jest.fn(),
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
                .put(`/rides/ride-update-123`)
                .set("Authorization", `Bearer ${token}`)
                .send({
                    originLat: 36.8,
                    originLng: 3.1,
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
                        status: { in: [RideStatus.PENDING, RideStatus.ACCEPTED, RideStatus.ONGOING] }
                    },
                    orderBy: { createdAt: "desc" }
                })
            );
        });

        it("should return null when no current rides exist", async () => {
            const testUserId = passengerPayload.userId;
            const token = generateToken(passengerPayload);

            (db.ride.findFirst as jest.Mock).mockResolvedValue(null);

            const res = await request(app)
                .get("/rides/current")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toBeNull();
        });

        it("should return passenger's current ride (role=USER)", async () => {
            const passengerRide = {
                id: "passenger-ride-123",
                userId: passengerPayload.userId,
                status: RideStatus.PENDING,
                driver: null,
                vehicle: null,
            };

            (db.ride.findFirst as jest.Mock).mockResolvedValue(passengerRide);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/current")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe("passenger-ride-123");
            expect(res.body.status).toBe(RideStatus.PENDING);

            // Verify it was called with userId filter
            expect(db.ride.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        userId: passengerPayload.userId
                    })
                })
            );
        });

        it("should return driver's current ride (role=DRIVER)", async () => {
            const driverRide = {
                id: "driver-ride-456",
                driverId: driverPayload.userId,
                status: RideStatus.ONGOING,
                user: {
                    id: "passenger-xyz",
                    firstName: "John",
                    lastName: "Doe",
                },
                vehicle: { id: "vehicle-1" },
            };

            (db.ride.findFirst as jest.Mock).mockResolvedValue(driverRide);

            const token = generateToken(driverPayload);
            const res = await request(app)
                .get("/rides/current")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe("driver-ride-456");
            expect(res.body.status).toBe(RideStatus.ONGOING);

            // Verify it was called with driverId filter
            expect(db.ride.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        driverId: driverPayload.userId
                    })
                })
            );
        });

        it("should filter PENDING rides for drivers (ACCEPTED/ONGOING only)", async () => {
            (db.ride.findFirst as jest.Mock).mockResolvedValue(null);

            const token = generateToken(driverPayload);
            await request(app)
                .get("/rides/current")
                .set("Authorization", `Bearer ${token}`);

            // Verify driver query excludes PENDING
            expect(db.ride.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        status: {
                            in: [RideStatus.ACCEPTED, RideStatus.ONGOING]
                        }
                    })
                })
            );
        });
    });

    describe("Duplicate Ride Prevention", () => {
        beforeEach(() => {
            (db.ride.create as jest.Mock).mockResolvedValue({
                id: "new-ride-123",
                status: RideStatus.PENDING,
            });
        });

        it("should reject ride creation when user has PENDING ride", async () => {
            (db.ride.findFirst as jest.Mock).mockResolvedValue({
                id: "existing-ride",
                status: RideStatus.PENDING,
            });

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    type: RideType.REGULAR,
                    originLat: 36.75,
                    originLng: 3.05,
                    destLat: 36.76,
                    destLng: 3.06,
                });

            expect(res.status).toBe(500);
            expect(res.body.error).toMatch(/already have an active ride/i);
        });

        it("should reject ride creation when user has ACCEPTED ride", async () => {
            (db.ride.findFirst as jest.Mock).mockResolvedValue({
                id: "existing-ride",
                status: RideStatus.ACCEPTED,
            });

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    type: RideType.REGULAR,
                    originLat: 36.75,
                    originLng: 3.05,
                    destLat: 36.76,
                    destLng: 3.06,
                });

            expect(res.status).toBe(500);
            expect(res.body.error).toMatch(/ACCEPTED/);
        });

        it("should allow ride creation after COMPLETED ride", async () => {
            (db.ride.findFirst as jest.Mock).mockResolvedValue(null);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    type: RideType.REGULAR,
                    originLat: 36.75,
                    originLng: 3.05,
                    destLat: 36.76,
                    destLng: 3.06,
                });

            expect(res.status).toBe(201);
        });
    });

    describe("GET /rides/user - Query Parameters", () => {
        it("should filter by status query parameter", async () => {
            const acceptedRides = [{
                id: "ride-1",
                status: RideStatus.ACCEPTED,
            }];

            (db.ride.findMany as jest.Mock).mockResolvedValue(acceptedRides);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/user?status=ACCEPTED")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
        });

        it("should return all rides when no status filter", async () => {
            const allRides = [
                { id: "ride-1", status: RideStatus.PENDING },
                { id: "ride-2", status: RideStatus.COMPLETED },
            ];

            (db.ride.findMany as jest.Mock).mockResolvedValue(allRides);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/user")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
        });
    });

    describe("Authorization - Ride Updates", () => {
        const otherUserPayload = { userId: "other-user-789", role: Role.USER };

        it("should reject updating someone else's ride (403 Forbidden)", async () => {
            const someoneElsesRide = {
                id: "ride-123",
                userId: "passenger-123",  // Different user
                status: RideStatus.PENDING,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(someoneElsesRide);

            const token = generateToken(otherUserPayload);
            const res = await request(app)
                .put("/rides/ride-123")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    originLat: 36.8,
                    originLng: 3.1,
                });

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/not authorized|only the passenger/i);
        });

        it("should reject status update from non-participant (403 Forbidden)", async () => {
            const ride = {
                id: "ride-456",
                userId: "passenger-123",
                driverId: "driver-456",
                status: RideStatus.ACCEPTED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(ride);

            const token = generateToken(otherUserPayload);  // Not passenger or driver
            const res = await request(app)
                .put("/rides/ride-456/status")
                .set("Authorization", `Bearer ${token}`)
                .send({ status: RideStatus.ONGOING });

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/not authorized/i);
        });

        it("should allow passenger to update their own PENDING ride", async () => {
            const passengerRide = {
                id: "ride-789",
                userId: passengerPayload.userId,
                status: RideStatus.PENDING,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(passengerRide);
            (db.ride.update as jest.Mock).mockResolvedValue({
                ...passengerRide,
                originLat: 36.8,
            });

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .put("/rides/ride-789")
                .set("Authorization", `Bearer ${token}`)
                .send({ originLat: 36.8 });

            expect(res.status).toBe(200);
        });

        it("should allow driver to update status of their ride", async () => {
            const driverRide = {
                id: "ride-driver-123",
                userId: "passenger-xyz",
                driverId: driverPayload.userId,  // Driver's ride
                status: RideStatus.ACCEPTED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(driverRide);
            (db.ride.update as jest.Mock).mockResolvedValue({
                ...driverRide,
                status: RideStatus.ONGOING,
            });

            const token = generateToken(driverPayload);
            const res = await request(app)
                .put("/rides/ride-driver-123/status")
                .set("Authorization", `Bearer ${token}`)
                .send({ status: RideStatus.ONGOING });

            expect(res.status).toBe(200);
        });

        it("should reject cancel from non-participant (403 Forbidden)", async () => {
            const ride = {
                id: "ride-cancel-123",
                userId: "passenger-123",
                driverId: "driver-456",
                status: RideStatus.ACCEPTED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(ride);

            const token = generateToken(otherUserPayload);
            const res = await request(app)
                .put("/rides/ride-cancel-123/cancel")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/not authorized/i);
        });

        it("should return 404 for non-existent ride", async () => {
            (db.ride.findUnique as jest.Mock).mockResolvedValue(null);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .put("/rides/nonexistent-ride")
                .set("Authorization", `Bearer ${token}`)
                .send({ originLat: 36.8 });

            expect(res.status).toBe(404);
            expect(res.body.error).toMatch(/not found/i);
        });

        it("should return 400 for invalid status transitions", async () => {
            const ride = {
                id: "ride-transition-123",
                userId: passengerPayload.userId,
                status: RideStatus.PENDING,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(ride);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .put("/rides/ride-transition-123/status")
                .set("Authorization", `Bearer ${token}`)
                .send({ status: RideStatus.ONGOING });  // Can't go PENDING -> ONGOING

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/only start an accepted/i);
        });
    });
});

