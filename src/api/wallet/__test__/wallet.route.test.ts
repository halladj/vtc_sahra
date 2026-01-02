import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Role, TransactionType } from "@prisma/client";
import walletRouter from "../wallet.route";

// Mock the wallet services
jest.mock("../wallet.services", () => ({
    findWalletByUserId: jest.fn(),
    creditWallet: jest.fn(),
    debitWallet: jest.fn(),
}));

import * as walletServices from "../wallet.services";

// Mock environment
process.env.JWT_ACCESS_SECRET = "testsecret";

const app = express();
app.use(express.json());
app.use("/wallet", walletRouter);

describe("Wallet Routes", () => {
    const userPayload = { userId: "user-123", role: Role.USER };
    const adminPayload = { userId: "admin-123", role: Role.ADMIN };

    const generateToken = (payload: any) => {
        return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
            expiresIn: "1h",
        });
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("GET /wallet - Get user's wallet", () => {
        it("should return wallet with balance and transactions", async () => {
            const mockWallet = {
                id: "wallet-123",
                userId: userPayload.userId,
                balance: 5000,
                transactions: [
                    {
                        id: "tx-1",
                        walletId: "wallet-123",
                        type: TransactionType.CREDIT,
                        amount: 5000,
                        reference: "Initial credit",
                        createdAt: new Date(),
                    },
                ],
            };

            (walletServices.findWalletByUserId as jest.Mock).mockResolvedValue(mockWallet);

            const token = generateToken(userPayload);
            const res = await request(app)
                .get("/wallet")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe("wallet-123");
            expect(res.body.balance).toBe(5000);
            expect(res.body.transactions).toHaveLength(1);
            expect(walletServices.findWalletByUserId).toHaveBeenCalledWith(userPayload.userId);
        });

        it("should return 404 if wallet not found", async () => {
            (walletServices.findWalletByUserId as jest.Mock).mockResolvedValue(null);

            const token = generateToken(userPayload);
            const res = await request(app)
                .get("/wallet")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(404);
            expect(res.body.error).toContain("Wallet not found");
        });

        it("should reject request without authentication", async () => {
            const res = await request(app).get("/wallet");

            expect(res.status).toBe(401);
        });
    });

    describe("GET /wallet/transactions - Get transaction history", () => {
        it("should return transaction history for authenticated user", async () => {
            const mockWallet = {
                id: "wallet-123",
                userId: userPayload.userId,
                balance: 5000,
                transactions: [
                    {
                        id: "tx-1",
                        type: TransactionType.CREDIT,
                        amount: 5000,
                        reference: "Top-up",
                        createdAt: new Date("2024-01-01"),
                    },
                    {
                        id: "tx-2",
                        type: TransactionType.DEBIT,
                        amount: 500,
                        reference: "Ride payment",
                        createdAt: new Date("2024-01-02"),
                    },
                ],
            };

            (walletServices.findWalletByUserId as jest.Mock).mockResolvedValue(mockWallet);

            const token = generateToken(userPayload);
            const res = await request(app)
                .get("/wallet/transactions")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(res.body[0].type).toBe(TransactionType.CREDIT);
            expect(res.body[1].type).toBe(TransactionType.DEBIT);
        });

        it("should return 404 if wallet not found", async () => {
            (walletServices.findWalletByUserId as jest.Mock).mockResolvedValue(null);

            const token = generateToken(userPayload);
            const res = await request(app)
                .get("/wallet/transactions")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(404);
            expect(res.body.error).toContain("Wallet not found");
        });
    });

    describe("POST /wallet/credit - Credit wallet (admin only)", () => {
        it("should allow admin to credit a user's wallet", async () => {
            const mockResult = {
                wallet: {
                    id: "wallet-123",
                    userId: "target-user-123",
                    balance: 6000,
                },
                transaction: {
                    id: "tx-123",
                    walletId: "wallet-123",
                    type: TransactionType.CREDIT,
                    amount: 1000,
                    reference: "Admin top-up",
                    createdAt: new Date(),
                },
            };

            (walletServices.creditWallet as jest.Mock).mockResolvedValue(mockResult);

            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/wallet/credit")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    userId: "target-user-123",
                    amount: 1000,
                    reference: "Admin top-up",
                });

            expect(res.status).toBe(200);
            expect(res.body.wallet.balance).toBe(6000);
            expect(res.body.transaction.amount).toBe(1000);
            expect(res.body.transaction.type).toBe(TransactionType.CREDIT);
        });

        it("should reject request from non-admin user", async () => {
            const token = generateToken(userPayload);
            const res = await request(app)
                .post("/wallet/credit")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    userId: "target-user-123",
                    amount: 1000,
                });

            expect(res.status).toBe(403);
        });

        it("should reject request with missing userId", async () => {
            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/wallet/credit")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    amount: 1000,
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Missing required fields");
        });

        it("should reject request with missing amount", async () => {
            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/wallet/credit")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    userId: "target-user-123",
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Missing required fields");
        });

        it("should reject request with negative amount", async () => {
            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/wallet/credit")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    userId: "target-user-123",
                    amount: -500,
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Amount must be a positive number");
        });

        it("should reject request with zero amount", async () => {
            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/wallet/credit")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    userId: "target-user-123",
                    amount: 0,
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Amount must be a positive number");
        });
    });

    describe("POST /wallet/debit - Debit wallet (admin only)", () => {
        it("should allow admin to debit a user's wallet", async () => {
            const mockResult = {
                wallet: {
                    id: "wallet-123",
                    userId: "target-user-123",
                    balance: 4000,
                },
                transaction: {
                    id: "tx-123",
                    walletId: "wallet-123",
                    type: TransactionType.DEBIT,
                    amount: 1000,
                    reference: "Admin deduction",
                    createdAt: new Date(),
                },
            };

            (walletServices.debitWallet as jest.Mock).mockResolvedValue(mockResult);

            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/wallet/debit")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    userId: "target-user-123",
                    amount: 1000,
                    reference: "Admin deduction",
                });

            expect(res.status).toBe(200);
            expect(res.body.wallet.balance).toBe(4000);
            expect(res.body.transaction.amount).toBe(1000);
            expect(res.body.transaction.type).toBe(TransactionType.DEBIT);
        });

        it("should reject request from non-admin user", async () => {
            const token = generateToken(userPayload);
            const res = await request(app)
                .post("/wallet/debit")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    userId: "target-user-123",
                    amount: 1000,
                });

            expect(res.status).toBe(403);
        });

        it("should reject request with missing userId", async () => {
            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/wallet/debit")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    amount: 1000,
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Missing required fields");
        });

        it("should reject request with negative amount", async () => {
            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/wallet/debit")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    userId: "target-user-123",
                    amount: -500,
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Amount must be a positive number");
        });
    });
});
