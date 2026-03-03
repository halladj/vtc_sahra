import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
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
        passwordResetToken: {
            findFirst: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

jest.mock("../../user/user.services", () => ({
    findUserByEmail: jest.fn(),
    createUserByEmailAndPassword: jest.fn(),
    findUserById: jest.fn(),
    updateUsersPassword: jest.fn(),
}));

jest.mock("../auth.services", () => ({
    addRefreshTokenToWhitelist: jest.fn(),
    findRefreshToken: jest.fn(),
    deleteRefreshTokenById: jest.fn(),
    revokeTokens: jest.fn(),
    createPasswordResetToken: jest.fn(),
    findPasswordResetToken: jest.fn(),
    deletePasswordResetToken: jest.fn(),
}));

jest.mock("../../driver/driver.services", () => ({
    createDriverByEmailAndPassword: jest.fn(),
}));

jest.mock("../../../utils/jwt", () => ({
    generateTokens: jest.fn(() => ({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
    })),
}));

// Mock bcrypt to avoid real hashing in tests
jest.mock("bcrypt", () => ({
    compare: jest.fn(),
    hash: jest.fn(),
}));

import authRouter from "../auth.routes";
import {
    findUserByEmail,
    createUserByEmailAndPassword,
    findUserById,
    updateUsersPassword,
} from "../../user/user.services";
import {
    addRefreshTokenToWhitelist,
    findRefreshToken,
    deleteRefreshTokenById,
    revokeTokens,
    createPasswordResetToken,
    findPasswordResetToken,
    deletePasswordResetToken,
} from "../auth.services";
import { createDriverByEmailAndPassword } from "../../driver/driver.services";
import { generateTokens } from "../../../utils/jwt";

process.env.JWT_ACCESS_SECRET = "testsecret";

const app = express();
app.use(express.json());
app.use("/auth", authRouter);
app.use((err: any, req: any, res: any, next: any) => {
    res.status(err.status || res.statusCode || 500).json({ error: err.message });
});

const generateToken = (payload: any) =>
    jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: "1h" });

// ─────────────────────────────────────────────────────────────────────────────
// Admin Registration
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /auth/register-admin", () => {
    const adminPayload = { userId: "admin-123", role: Role.ADMIN };
    const userPayload = { userId: "user-123", role: Role.USER };
    const driverPayload = { userId: "driver-123", role: Role.DRIVER };

    const validAdminData = {
        email: "newadmin@vtc.dz",
        password: "SecurePass123!",
        phoneNumber: "+213555999999",
        firstName: "New",
        lastName: "Admin",
    };

    beforeEach(() => jest.clearAllMocks());

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
            expect.objectContaining({ email: validAdminData.email, role: Role.ADMIN })
        );
    });

    it("should reject unauthenticated request", async () => {
        const res = await request(app).post("/auth/register-admin").send(validAdminData);
        expect(res.status).toBe(401);
    });

    it("should reject regular user (403)", async () => {
        const token = generateToken(userPayload);
        const res = await request(app)
            .post("/auth/register-admin")
            .set("Authorization", `Bearer ${token}`)
            .send(validAdminData);
        expect(res.status).toBe(403);
    });

    it("should reject driver role (403)", async () => {
        const token = generateToken(driverPayload);
        const res = await request(app)
            .post("/auth/register-admin")
            .set("Authorization", `Bearer ${token}`)
            .send(validAdminData);
        expect(res.status).toBe(403);
    });

    it("should reject duplicate email", async () => {
        (findUserByEmail as jest.Mock).mockResolvedValue({ id: "existing" });
        const token = generateToken(adminPayload);
        const res = await request(app)
            .post("/auth/register-admin")
            .set("Authorization", `Bearer ${token}`)
            .send(validAdminData);
        expect(res.status).toBe(400);
        expect(res.body.error).toContain("Email already in use");
    });

    it("should reject missing email", async () => {
        const token = generateToken(adminPayload);
        const res = await request(app)
            .post("/auth/register-admin")
            .set("Authorization", `Bearer ${token}`)
            .send({ password: "Test123!" });
        expect(res.status).toBe(400);
    });

    it("should reject missing password", async () => {
        const token = generateToken(adminPayload);
        const res = await request(app)
            .post("/auth/register-admin")
            .set("Authorization", `Bearer ${token}`)
            .send({ email: "test@vtc.dz" });
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// User Registration
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /auth/register", () => {
    beforeEach(() => jest.clearAllMocks());

    it("should register a new user successfully", async () => {
        const mockUser = {
            id: "user-123",
            email: "user@vtc.dz",
            role: Role.USER,
        };

        (findUserByEmail as jest.Mock).mockResolvedValue(null);
        (createUserByEmailAndPassword as jest.Mock).mockResolvedValue(mockUser);

        const res = await request(app).post("/auth/register").send({
            email: "user@vtc.dz",
            password: "Password123!",
            phoneNumber: "+213555000000",
            firstName: "Alice",
            lastName: "Dupont",
        });

        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBe("mock-access-token");
        expect(res.body.refreshToken).toBe("mock-refresh-token");
        expect(createUserByEmailAndPassword).toHaveBeenCalledWith(
            expect.objectContaining({ email: "user@vtc.dz", role: Role.USER })
        );
    });

    it("should reject missing email", async () => {
        const res = await request(app).post("/auth/register").send({
            password: "Password123!",
            phoneNumber: "+213555000000",
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain("email");
    });

    it("should reject missing password", async () => {
        const res = await request(app).post("/auth/register").send({
            email: "user@vtc.dz",
            phoneNumber: "+213555000000",
        });
        expect(res.status).toBe(400);
    });

    it("should reject missing phone number", async () => {
        const res = await request(app).post("/auth/register").send({
            email: "user@vtc.dz",
            password: "Password123!",
        });
        expect(res.status).toBe(400);
    });

    it("should reject duplicate email", async () => {
        (findUserByEmail as jest.Mock).mockResolvedValue({ id: "existing-user" });
        const res = await request(app).post("/auth/register").send({
            email: "user@vtc.dz",
            password: "Password123!",
            phoneNumber: "+213555000000",
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain("Email already in use");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /auth/login", () => {
    beforeEach(() => jest.clearAllMocks());

    it("should login with valid credentials", async () => {
        const mockUser = {
            id: "user-123",
            email: "user@vtc.dz",
            password: "hashed-password",
            role: Role.USER,
        };

        (findUserByEmail as jest.Mock).mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const res = await request(app).post("/auth/login").send({
            email: "user@vtc.dz",
            password: "Password123!",
        });

        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBe("mock-access-token");
        expect(res.body.refreshToken).toBe("mock-refresh-token");
        expect(addRefreshTokenToWhitelist).toHaveBeenCalled();
    });

    it("should reject missing email or password", async () => {
        const res = await request(app).post("/auth/login").send({ email: "user@vtc.dz" });
        expect(res.status).toBe(400);
    });

    it("should reject unknown email (403)", async () => {
        (findUserByEmail as jest.Mock).mockResolvedValue(null);
        const res = await request(app).post("/auth/login").send({
            email: "nobody@vtc.dz",
            password: "Password123!",
        });
        expect(res.status).toBe(403);
        expect(res.body.error).toContain("Invalid login credentials");
    });

    it("should reject wrong password (403)", async () => {
        const mockUser = {
            id: "user-123",
            email: "user@vtc.dz",
            password: "hashed-password",
        };
        (findUserByEmail as jest.Mock).mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        const res = await request(app).post("/auth/login").send({
            email: "user@vtc.dz",
            password: "WrongPassword!",
        });
        expect(res.status).toBe(403);
        expect(res.body.error).toContain("Invalid login credentials");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Refresh Token
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /auth/refreshToken", () => {
    beforeEach(() => jest.clearAllMocks());

    it("should return new token pair for valid refresh token", async () => {
        const mockSavedToken = {
            id: "rt-123",
            userId: "user-123",
            revoked: false,
            expireAt: new Date(Date.now() + 1000 * 60 * 60),
        };
        const mockUser = { id: "user-123", email: "user@vtc.dz", role: Role.USER };

        (findRefreshToken as jest.Mock).mockResolvedValue(mockSavedToken);
        (findUserById as jest.Mock).mockResolvedValue(mockUser);
        (deleteRefreshTokenById as jest.Mock).mockResolvedValue(undefined);

        const res = await request(app)
            .post("/auth/refreshToken")
            .send({ refreshToken: "valid-refresh-token" });

        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBe("mock-access-token");
        expect(deleteRefreshTokenById).toHaveBeenCalledWith("rt-123");
    });

    it("should reject missing refreshToken (400)", async () => {
        const res = await request(app).post("/auth/refreshToken").send({});
        expect(res.status).toBe(400);
    });

    it("should reject revoked refresh token (401)", async () => {
        (findRefreshToken as jest.Mock).mockResolvedValue({
            id: "rt-123",
            userId: "user-123",
            revoked: true,
            expireAt: new Date(Date.now() + 1000 * 60 * 60),
        });

        const res = await request(app)
            .post("/auth/refreshToken")
            .send({ refreshToken: "revoked-token" });

        expect(res.status).toBe(401);
    });

    it("should reject expired refresh token (401)", async () => {
        (findRefreshToken as jest.Mock).mockResolvedValue({
            id: "rt-123",
            userId: "user-123",
            revoked: false,
            expireAt: new Date(Date.now() - 1000), // already expired
        });

        const res = await request(app)
            .post("/auth/refreshToken")
            .send({ refreshToken: "expired-token" });

        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Forgot Password
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /auth/forgot-password", () => {
    beforeEach(() => jest.clearAllMocks());

    it("should create reset token for existing user", async () => {
        const mockUser = { id: "user-123", email: "user@vtc.dz" };
        (findUserByEmail as jest.Mock).mockResolvedValue(mockUser);
        (createPasswordResetToken as jest.Mock).mockResolvedValue(undefined);

        const res = await request(app)
            .post("/auth/forgot-password")
            .send({ email: "user@vtc.dz" });

        expect(res.status).toBe(200);
        expect(res.body.message).toContain("Reset link sent");
        expect(createPasswordResetToken).toHaveBeenCalledWith(
            expect.any(String),
            "user-123",
            expect.any(Date)
        );
    });

    it("should return 404 for unknown email", async () => {
        (findUserByEmail as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post("/auth/forgot-password")
            .send({ email: "ghost@vtc.dz" });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("User not found");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reset Password
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /auth/reset-password", () => {
    beforeEach(() => jest.clearAllMocks());

    it("should reset password with valid token", async () => {
        const mockResetToken = {
            id: "reset-123",
            userId: "user-123",
            token: "valid-reset-token",
            expiresAt: new Date(Date.now() + 1000 * 60 * 15),
        };
        const mockUser = { id: "user-123", password: "old-hashed-password" };

        (findPasswordResetToken as jest.Mock).mockResolvedValue(mockResetToken);
        (findUserById as jest.Mock).mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(false); // new password is different
        (bcrypt.hash as jest.Mock).mockResolvedValue("new-hashed-password");
        (updateUsersPassword as jest.Mock).mockResolvedValue(undefined);
        (deletePasswordResetToken as jest.Mock).mockResolvedValue(undefined);

        const res = await request(app)
            .post("/auth/reset-password")
            .send({ token: "valid-reset-token", newPassword: "NewPassword456!" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Password reset successfully");
        expect(updateUsersPassword).toHaveBeenCalledWith("user-123", "new-hashed-password");
        expect(deletePasswordResetToken).toHaveBeenCalledWith("valid-reset-token");
    });

    it("should return 400 for invalid token", async () => {
        (findPasswordResetToken as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post("/auth/reset-password")
            .send({ token: "invalid-token", newPassword: "NewPassword456!" });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid token");
    });

    it("should return 400 for expired token", async () => {
        (findPasswordResetToken as jest.Mock).mockResolvedValue({
            id: "reset-123",
            userId: "user-123",
            token: "expired-token",
            expiresAt: new Date(Date.now() - 1000), // already expired
        });

        const res = await request(app)
            .post("/auth/reset-password")
            .send({ token: "expired-token", newPassword: "NewPassword456!" });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Token expired");
    });

    it("should return 400 if reusing the same password", async () => {
        const mockResetToken = {
            id: "reset-123",
            userId: "user-123",
            token: "valid-reset-token",
            expiresAt: new Date(Date.now() + 1000 * 60 * 15),
        };
        const mockUser = { id: "user-123", password: "same-hashed-password" };

        (findPasswordResetToken as jest.Mock).mockResolvedValue(mockResetToken);
        (findUserById as jest.Mock).mockResolvedValue(mockUser);
        (bcrypt.hash as jest.Mock).mockResolvedValue("same-hashed-password");
        (bcrypt.compare as jest.Mock).mockResolvedValue(true); // same password

        const res = await request(app)
            .post("/auth/reset-password")
            .send({ token: "valid-reset-token", newPassword: "SamePassword123!" });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain("different password");
    });
});
