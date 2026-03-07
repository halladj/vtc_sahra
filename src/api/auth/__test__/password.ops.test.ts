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
            update: jest.fn(),
        },
        passwordResetToken: {
            findUnique: jest.fn(),
            delete: jest.fn(),
        },
    },
}));

jest.mock("../../user/user.services", () => ({
    findUserById: jest.fn(),
    updateUsersPassword: jest.fn(),
}));

jest.mock("../auth.services", () => ({
    findPasswordResetToken: jest.fn(),
    deletePasswordResetToken: jest.fn(),
}));

// Mock bcrypt to avoid real hashing in tests
jest.mock("bcrypt", () => ({
    compare: jest.fn(),
    hash: jest.fn(),
}));

import authRouter from "../auth.routes";
import { findUserById, updateUsersPassword } from "../../user/user.services";
import { findPasswordResetToken, deletePasswordResetToken } from "../auth.services";

process.env.JWT_ACCESS_SECRET = "testsecret";

const app = express();
app.use(express.json());
// Middleware to simulate authentication for change-password
app.use((req: any, _res, next) => {
    if (req.headers.authorization) {
        const token = req.headers.authorization.split(" ")[1];
        try {
            req.payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!);
        } catch (err) {
            // ignore
        }
    }
    next();
});
app.use("/auth", authRouter);
app.use((err: any, req: any, res: any, next: any) => {
    res.status(err.status || res.statusCode || 500).json({ error: err.message });
});

const generateToken = (payload: any) =>
    jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: "1h" });

describe("Password Operations", () => {
    beforeEach(() => jest.clearAllMocks());

    describe("POST /auth/reset-password", () => {
        it("should reset password with valid token and matching confirmation", async () => {
            const mockResetToken = {
                userId: "user-123",
                token: "valid-token",
                expiresAt: new Date(Date.now() + 1000 * 60 * 15),
            };
            const mockUser = { id: "user-123", password: "old-hashed-password" };

            (findPasswordResetToken as jest.Mock).mockResolvedValue(mockResetToken);
            (findUserById as jest.Mock).mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);
            (bcrypt.hash as jest.Mock).mockResolvedValue("new-hashed-password");

            const res = await request(app)
                .post("/auth/reset-password")
                .send({
                    token: "valid-token",
                    newPassword: "NewPassword123!",
                    confirmPassword: "NewPassword123!",
                });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Password reset successfully");
            expect(updateUsersPassword).toHaveBeenCalled();
            expect(deletePasswordResetToken).toHaveBeenCalledWith("valid-token");
        });

        it("should return 400 if passwords do not match", async () => {
            const res = await request(app)
                .post("/auth/reset-password")
                .send({
                    token: "some-token",
                    newPassword: "Pass1!",
                    confirmPassword: "Pass2!",
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Passwords do not match");
        });

        it("should return 400 if new password is same as old", async () => {
            const mockResetToken = { userId: "user-123", expiresAt: new Date(Date.now() + 10000) };
            const mockUser = { id: "user-123", password: "same-password" };

            (findPasswordResetToken as jest.Mock).mockResolvedValue(mockResetToken);
            (findUserById as jest.Mock).mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            const res = await request(app)
                .post("/auth/reset-password")
                .send({
                    token: "token",
                    newPassword: "SamePassword123!",
                    confirmPassword: "SamePassword123!",
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("different from the old one");
        });
    });

    describe("POST /auth/change-password", () => {
        const userId = "user-123";
        const token = generateToken({ userId, role: Role.USER });

        it("should change password when old password is correct", async () => {
            const mockUser = { id: userId, password: "old-hashed-password" };

            (findUserById as jest.Mock).mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            (bcrypt.hash as jest.Mock).mockResolvedValue("new-hashed-password");

            const res = await request(app)
                .post("/auth/change-password")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    oldPassword: "OldPassword123!",
                    newPassword: "NewPassword456!",
                    confirmPassword: "NewPassword456!",
                });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Password changed successfully");
            expect(updateUsersPassword).toHaveBeenCalledWith(userId, "new-hashed-password");
        });

        it("should return 403 for incorrect old password", async () => {
            const mockUser = { id: userId, password: "old-hashed-password" };

            (findUserById as jest.Mock).mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            const res = await request(app)
                .post("/auth/change-password")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    oldPassword: "WrongPassword!",
                    newPassword: "NewPassword456!",
                    confirmPassword: "NewPassword456!",
                });

            expect(res.status).toBe(403);
            expect(res.body.error).toBe("Invalid old password");
        });

        it("should return 400 if fields are missing", async () => {
            const res = await request(app)
                .post("/auth/change-password")
                .set("Authorization", `Bearer ${token}`)
                .send({ oldPassword: "Old" });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("required");
        });

        it("should return 400 if new passwords do not match", async () => {
            const res = await request(app)
                .post("/auth/change-password")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    oldPassword: "Old",
                    newPassword: "New1",
                    confirmPassword: "New2",
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("New passwords do not match");
        });
    });
});
