import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

// Mock database BEFORE importing router
jest.mock("../../../utils/db", () => ({
    db: {
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        wallet: {
            create: jest.fn(),
        },
        refreshToken: {
            create: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

// Mock user services
jest.mock("../../user/user.services", () => ({
    findUserByEmail: jest.fn(),
    createUserByEmailAndPassword: jest.fn(),
    findUserById: jest.fn(),
}));

// Mock auth services
jest.mock("../auth.services", () => ({
    addRefreshTokenToWhitelist: jest.fn(),
    findRefreshToken: jest.fn(),
    deleteRefreshTokenById: jest.fn(),
    revokeTokens: jest.fn(),
    createPasswordResetToken: jest.fn(),
    findPasswordResetToken: jest.fn(),
    deletePasswordResetToken: jest.fn(),
}));

// Mock driver services
jest.mock("../../driver/driver.services", () => ({
    createDriverByEmailAndPassword: jest.fn(),
}));

// Mock jwt utils
jest.mock("../../../utils/jwt", () => ({
    generateTokens: jest.fn(() => ({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
    })),
}));

import authRouter from "../auth.routes";
import { findUserByEmail, createUserByEmailAndPassword } from "../../user/user.services";

process.env.JWT_ACCESS_SECRET = "testsecret";

const app = express();
app.use(express.json());
app.use("/auth", authRouter);
app.use((err: any, req: any, res: any, next: any) => {
    res.status(err.status || res.statusCode || 500).json({ error: err.message });
});

describe("Auth Routes - Admin Registration", () => {
    const adminPayload = { userId: "admin-123", role: Role.ADMIN };
    const userPayload = { userId: "user-123", role: Role.USER };
    const driverPayload = { userId: "driver-123", role: Role.DRIVER };

    const generateToken = (payload: any) => {
        return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: "1h" });
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("POST /auth/register-admin", () => {
        const validAdminData = {
            email: "newadmin@vtc.dz",
            password: "SecurePass123!",
            phoneNumber: "+213555999999",
            firstName: "New",
            lastName: "Admin",
        };

        it("should create admin when called by existing admin", async () => {
            const mockAdmin = {
                id: "new-admin-123",
                email: validAdminData.email,
                firstName: validAdminData.firstName,
                lastName: validAdminData.lastName,
                role: Role.ADMIN,
            };

            (findUserByEmail as jest.Mock).mockResolvedValue(null);
            (createUserByEmailAndPassword as jest.Mock).mockResolvedValue(mockAdmin);

            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/auth/register-admin")
                .set("Authorization", `Bearer ${token}`)
                .send(validAdminData);

            expect(res.status).toBe(201);
            expect(res.body.message).toBe("Admin account created successfully");
            expect(res.body.admin.role).toBe(Role.ADMIN);
            expect(res.body.accessToken).toBeDefined();
            expect(createUserByEmailAndPassword).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: validAdminData.email,
                    role: Role.ADMIN,
                })
            );
        });

        it("should reject request without authentication", async () => {
            const res = await request(app)
                .post("/auth/register-admin")
                .send(validAdminData);

            expect(res.status).toBe(401);
        });

        it("should reject request from regular user", async () => {
            const token = generateToken(userPayload);
            const res = await request(app)
                .post("/auth/register-admin")
                .set("Authorization", `Bearer ${token}`)
                .send(validAdminData);

            expect(res.status).toBe(403);
        });

        it("should reject request from driver", async () => {
            const token = generateToken(driverPayload);
            const res = await request(app)
                .post("/auth/register-admin")
                .set("Authorization", `Bearer ${token}`)
                .send(validAdminData);

            expect(res.status).toBe(403);
        });

        it("should reject duplicate email", async () => {
            (findUserByEmail as jest.Mock).mockResolvedValue({ id: "existing-user" });

            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/auth/register-admin")
                .set("Authorization", `Bearer ${token}`)
                .send(validAdminData);

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Email already in use");
        });

        it("should reject request without email", async () => {
            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/auth/register-admin")
                .set("Authorization", `Bearer ${token}`)
                .send({ password: "Test123!" });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("email and a password");
        });

        it("should reject request without password", async () => {
            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/auth/register-admin")
                .set("Authorization", `Bearer ${token}`)
                .send({ email: "test@vtc.dz" });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("email and a password");
        });
    });
});
