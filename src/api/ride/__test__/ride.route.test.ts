import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { RideStatus, RideType, Role } from "@prisma/client";
import { db } from "../../../utils/db";
import rideRouter from "../ride.route";

// Mock the database
jest.mock("../../../utils/db", () => ({
    db: {
        ride: {
            create: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
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

// Mock payment services
jest.mock("../ride.payment.services", () => ({
    processRidePayment: jest.fn(),
    processDriverCancellationPenalty: jest.fn(),
}));

// Mock environment
process.env.JWT_ACCESS_SECRET = "testsecret";

const app = express();
app.use(express.json());
app.use("/rides", rideRouter);

describe("Ride Routes", () => {
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

    describe("POST /rides - Create a new ride", () => {
        const validRideData = {
            type: RideType.REGULAR,
            origin: "123 Main St, Algiers",
            destination: "456 Park Ave, Oran",
            distanceKm: 10.5,
            durationMin: 25,
            price: 500,
        };

        it("should create a new ride with valid data", async () => {
            const mockRide = {
                id: "ride-123",
                ...validRideData,
                userId: passengerPayload.userId,
                status: RideStatus.PENDING,
                user: {
                    id: passengerPayload.userId,
                    firstName: "John",
                    lastName: "Doe",
                    phoneNumber: "0555123456",
                    photo: null,
                },
            };

            (db.ride.create as jest.Mock).mockResolvedValue(mockRide);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send(validRideData);

            expect(res.status).toBe(201);
            expect(res.body.id).toBe("ride-123");
            expect(res.body.type).toBe(RideType.REGULAR);
            expect(res.body.status).toBe(RideStatus.PENDING);
            expect(db.ride.create).toHaveBeenCalled();
        });

        it("should reject request without authentication", async () => {
            const res = await request(app).post("/rides").send(validRideData);

            expect(res.status).toBe(401);
        });

        it("should reject request with missing required fields", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send({ type: RideType.REGULAR });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Missing required fields");
        });

        it("should reject SEAT_RESERVE ride without seatCount", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    ...validRideData,
                    type: RideType.SEAT_RESERVE,
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("seatCount is required");
        });

        it("should reject DELIVERY ride without packageWeight", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    ...validRideData,
                    type: RideType.DELIVERY,
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("packageWeight is required");
        });
    });

    describe("GET /rides/pending - Get pending rides", () => {
        it("should return pending rides for drivers", async () => {
            const mockRides = [
                {
                    id: "ride-1",
                    type: RideType.REGULAR,
                    status: RideStatus.PENDING,
                    origin: "Location A",
                    destination: "Location B",
                    price: 500,
                    user: {
                        id: "user-1",
                        firstName: "Alice",
                        lastName: "Smith",
                        phoneNumber: "0555111111",
                        photo: null,
                    },
                },
            ];

            (db.ride.findMany as jest.Mock).mockResolvedValue(mockRides);

            const token = generateToken(driverPayload);
            const res = await request(app)
                .get("/rides/pending")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].status).toBe(RideStatus.PENDING);
        });

        it("should reject non-driver users", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/pending")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(403);
        });
    });

    describe("GET /rides/user - Get user's rides", () => {
        it("should return all rides for the authenticated user", async () => {
            const mockRides = [
                {
                    id: "ride-1",
                    userId: passengerPayload.userId,
                    status: RideStatus.COMPLETED,
                    driver: { id: "driver-1", firstName: "Bob", lastName: "Driver" },
                },
            ];

            (db.ride.findMany as jest.Mock).mockResolvedValue(mockRides);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/user")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(db.ride.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        userId: passengerPayload.userId,
                    }),
                })
            );
        });

        it("should filter rides by status when provided", async () => {
            (db.ride.findMany as jest.Mock).mockResolvedValue([]);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/user?status=COMPLETED")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(db.ride.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        status: RideStatus.COMPLETED,
                    }),
                })
            );
        });
    });

    describe("GET /rides/driver - Get driver's rides", () => {
        it("should return all rides for the authenticated driver", async () => {
            const mockRides = [
                {
                    id: "ride-1",
                    driverId: driverPayload.userId,
                    status: RideStatus.ONGOING,
                    user: { id: "user-1", firstName: "Alice", lastName: "Passenger" },
                },
            ];

            (db.ride.findMany as jest.Mock).mockResolvedValue(mockRides);

            const token = generateToken(driverPayload);
            const res = await request(app)
                .get("/rides/driver")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
        });

        it("should reject non-driver users", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/driver")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(403);
        });
    });

    describe("GET /rides/:rideId - Get ride details", () => {
        it("should return ride details for authorized user", async () => {
            const mockRide = {
                id: "ride-123",
                userId: passengerPayload.userId,
                driverId: null,
                status: RideStatus.PENDING,
                origin: "Location A",
                destination: "Location B",
                price: 500,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/ride-123")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe("ride-123");
        });

        it("should return 404 for non-existent ride", async () => {
            (db.ride.findUnique as jest.Mock).mockResolvedValue(null);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/nonexistent")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(404);
            expect(res.body.error).toContain("Ride not found");
        });

        it("should reject unauthorized users", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "other-user",
                driverId: "other-driver",
                status: RideStatus.PENDING,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .get("/rides/ride-123")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toContain("Unauthorized");
        });
    });

    describe("POST /rides/:rideId/accept - Accept a ride", () => {
        it("should allow driver to accept a pending ride", async () => {
            const mockDriverProfile = { id: "driver-profile-123", userId: driverPayload.userId };
            const mockVehicle = { id: "vehicle-123", driverId: "driver-profile-123" };
            const mockRide = {
                id: "ride-123",
                status: RideStatus.PENDING,
            };
            const mockUpdatedRide = {
                ...mockRide,
                driverId: driverPayload.userId,
                vehicleId: "vehicle-123",
                status: RideStatus.ACCEPTED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.driverProfile.findUnique as jest.Mock).mockResolvedValue(mockDriverProfile);
            (db.vehicle.findUnique as jest.Mock).mockResolvedValue(mockVehicle);
            (db.ride.update as jest.Mock).mockResolvedValue(mockUpdatedRide);

            const token = generateToken(driverPayload);
            const res = await request(app)
                .post("/rides/ride-123/accept")
                .set("Authorization", `Bearer ${token}`)
                .send({ vehicleId: "vehicle-123" });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe(RideStatus.ACCEPTED);
        });

        it("should reject request without vehicleId", async () => {
            const token = generateToken(driverPayload);
            const res = await request(app)
                .post("/rides/ride-123/accept")
                .set("Authorization", `Bearer ${token}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("vehicleId is required");
        });

        it("should reject non-driver users", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .post("/rides/ride-123/accept")
                .set("Authorization", `Bearer ${token}`)
                .send({ vehicleId: "vehicle-123" });

            expect(res.status).toBe(403);
        });
    });

    describe("PUT /rides/:rideId/status - Update ride status", () => {
        it("should update ride status for authorized user", async () => {
            const mockRide = {
                id: "ride-123",
                userId: passengerPayload.userId,
                driverId: driverPayload.userId,
                status: RideStatus.ACCEPTED,
            };
            const mockUpdatedRide = {
                ...mockRide,
                status: RideStatus.ONGOING,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.ride.update as jest.Mock).mockResolvedValue(mockUpdatedRide);

            const token = generateToken(driverPayload);
            const res = await request(app)
                .put("/rides/ride-123/status")
                .set("Authorization", `Bearer ${token}`)
                .send({ status: RideStatus.ONGOING });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe(RideStatus.ONGOING);
        });

        it("should reject request without status", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .put("/rides/ride-123/status")
                .set("Authorization", `Bearer ${token}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("status is required");
        });

        it("should reject invalid status value", async () => {
            const token = generateToken(passengerPayload);
            const res = await request(app)
                .put("/rides/ride-123/status")
                .set("Authorization", `Bearer ${token}`)
                .send({ status: "INVALID_STATUS" });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Invalid status value");
        });
    });

    describe("PUT /rides/:rideId/cancel - Cancel a ride", () => {
        it("should allow passenger to cancel their ride", async () => {
            const mockRide = {
                id: "ride-123",
                userId: passengerPayload.userId,
                driverId: null,
                status: RideStatus.PENDING,
            };
            const mockCancelledRide = {
                ...mockRide,
                status: RideStatus.CANCELLED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.ride.update as jest.Mock).mockResolvedValue(mockCancelledRide);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .put("/rides/ride-123/cancel")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe(RideStatus.CANCELLED);
        });

        it("should allow driver to cancel accepted ride", async () => {
            const mockRide = {
                id: "ride-123",
                userId: "passenger-123",
                driverId: driverPayload.userId,
                status: RideStatus.ACCEPTED,
            };
            const mockCancelledRide = {
                ...mockRide,
                status: RideStatus.CANCELLED,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.ride.update as jest.Mock).mockResolvedValue(mockCancelledRide);

            const token = generateToken(driverPayload);
            const res = await request(app)
                .put("/rides/ride-123/cancel")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe(RideStatus.CANCELLED);
        });
    });

    describe("PUT /rides/:rideId - Update ride details", () => {
        it("should allow passenger to update pending ride", async () => {
            const mockRide = {
                id: "ride-123",
                userId: passengerPayload.userId,
                status: RideStatus.PENDING,
                origin: "Old Origin",
                destination: "Old Destination",
                price: 500,
            };
            const mockUpdatedRide = {
                ...mockRide,
                origin: "New Origin",
                price: 600,
            };

            (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
            (db.ride.update as jest.Mock).mockResolvedValue(mockUpdatedRide);

            const token = generateToken(passengerPayload);
            const res = await request(app)
                .put("/rides/ride-123")
                .set("Authorization", `Bearer ${token}`)
                .send({ origin: "New Origin", price: 600 });

            expect(res.status).toBe(200);
            expect(res.body.origin).toBe("New Origin");
            expect(res.body.price).toBe(600);
        });
    });

    describe("Payment Integration Tests", () => {
        const paymentServices = require("../ride.payment.services");

        describe("Ride Completion with Payment", () => {
            it("should process payment when completing a ride", async () => {
                const mockRide = {
                    id: "ride-123",
                    userId: "passenger-123",
                    driverId: "driver-123",
                    status: RideStatus.ONGOING,
                    price: 100000,
                };

                const updatedRide = {
                    ...mockRide,
                    status: RideStatus.COMPLETED,
                };

                (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
                (db.ride.update as jest.Mock).mockResolvedValue(updatedRide);
                (paymentServices.processRidePayment as jest.Mock).mockResolvedValue({
                    passengerBalance: 50000,
                    driverBalance: 135000,
                    commission: { amount: 15000 },
                });

                const token = generateToken(passengerPayload);
                const res = await request(app)
                    .put("/rides/ride-123/status")
                    .set("Authorization", `Bearer ${token}`)
                    .send({ status: RideStatus.COMPLETED });

                expect(res.status).toBe(200);
                expect(paymentServices.processRidePayment).toHaveBeenCalledWith(
                    "ride-123",
                    "passenger-123",
                    "driver-123",
                    100000
                );
            });

            it("should return 402 when passenger has insufficient balance", async () => {
                const mockRide = {
                    id: "ride-123",
                    userId: "passenger-123",
                    driverId: "driver-123",
                    status: RideStatus.ONGOING,
                    price: 100000,
                };

                (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
                (paymentServices.processRidePayment as jest.Mock).mockRejectedValue(
                    new Error("Insufficient balance to complete ride")
                );

                const token = generateToken(passengerPayload);
                const res = await request(app)
                    .put("/rides/ride-123/status")
                    .set("Authorization", `Bearer ${token}`)
                    .send({ status: RideStatus.COMPLETED });

                expect(res.status).toBe(402);
                expect(res.body.error).toBe("Insufficient balance to complete ride");
                expect(res.body.code).toBe("INSUFFICIENT_BALANCE");
            });
        });

        describe("Driver Cancellation with Penalty", () => {
            it("should apply penalty when driver cancels accepted ride", async () => {
                const mockRide = {
                    id: "ride-123",
                    userId: "passenger-123",
                    driverId: "driver-123",
                    status: RideStatus.ACCEPTED,
                    price: 100000,
                };

                const cancelledRide = {
                    ...mockRide,
                    status: RideStatus.CANCELLED,
                };

                (db.ride.findUnique as jest.Mock).mockResolvedValue(mockRide);
                (db.ride.update as jest.Mock).mockResolvedValue(cancelledRide);
                (paymentServices.processDriverCancellationPenalty as jest.Mock).mockResolvedValue({
                    penaltyCharged: 10000,
                    driverBalance: 40000,
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

            it("should not apply penalty when passenger cancels ride", async () => {
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
    });
});
