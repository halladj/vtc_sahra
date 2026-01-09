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
            price: 500,
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
                .send({ type: RideType.REGULAR, price: 500 });

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
                price: 500,
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
});
