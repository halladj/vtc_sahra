import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import giftcardRouter from "../giftcard.route";

// Mock the giftcard services
jest.mock("../giftcard.services", () => ({
    createGiftCard: jest.fn(),
    findGiftCardByCode: jest.fn(),
    getAllGiftCards: jest.fn(),
    redeemGiftCard: jest.fn(),
}));

import * as giftcardServices from "../giftcard.services";

// Mock environment
process.env.JWT_ACCESS_SECRET = "testsecret";

const app = express();
app.use(express.json());
app.use("/giftcards", giftcardRouter);

describe("Gift Card Routes", () => {
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

    describe("POST /giftcards - Create gift card (admin only)", () => {
        it("should allow admin to create gift card", async () => {
            const mockGiftCard = {
                id: "gc-123",
                code: "GIFT-ABC123",
                amount: 100000,
                isUsed: false,
                usedBy: null,
                usedAt: null,
            };

            (giftcardServices.createGiftCard as jest.Mock).mockResolvedValue(
                mockGiftCard
            );

            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/giftcards")
                .set("Authorization", `Bearer ${token}`)
                .send({ amount: 100000 });

            expect(res.status).toBe(201);
            expect(res.body.code).toBe("GIFT-ABC123");
            expect(res.body.amount).toBe(100000);
            expect(giftcardServices.createGiftCard).toHaveBeenCalledWith(
                100000,
                undefined
            );
        });

        it("should allow admin to create gift card with custom code", async () => {
            const mockGiftCard = {
                id: "gc-123",
                code: "CUSTOM-CODE",
                amount: 50000,
                isUsed: false,
                usedBy: null,
                usedAt: null,
            };

            (giftcardServices.createGiftCard as jest.Mock).mockResolvedValue(
                mockGiftCard
            );

            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/giftcards")
                .set("Authorization", `Bearer ${token}`)
                .send({ amount: 50000, code: "CUSTOM-CODE" });

            expect(res.status).toBe(201);
            expect(res.body.code).toBe("CUSTOM-CODE");
            expect(giftcardServices.createGiftCard).toHaveBeenCalledWith(
                50000,
                "CUSTOM-CODE"
            );
        });

        it("should reject non-admin users", async () => {
            const token = generateToken(userPayload);
            const res = await request(app)
                .post("/giftcards")
                .set("Authorization", `Bearer ${token}`)
                .send({ amount: 100000 });

            expect(res.status).toBe(403);
        });

        it("should reject request without amount", async () => {
            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/giftcards")
                .set("Authorization", `Bearer ${token}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Amount is required");
        });

        it("should reject request with negative amount", async () => {
            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/giftcards")
                .set("Authorization", `Bearer ${token}`)
                .send({ amount: -1000 });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Amount must be positive");
        });

        it("should return 409 if code already exists", async () => {
            (giftcardServices.createGiftCard as jest.Mock).mockRejectedValue(
                new Error("Gift card code already exists")
            );

            const token = generateToken(adminPayload);
            const res = await request(app)
                .post("/giftcards")
                .set("Authorization", `Bearer ${token}`)
                .send({ amount: 100000, code: "EXISTING" });

            expect(res.status).toBe(409);
            expect(res.body.error).toBe("Gift card code already exists");
        });
    });

    describe("GET /giftcards - Get all gift cards (admin only)", () => {
        it("should return all gift cards for admin", async () => {
            const mockGiftCards = [
                {
                    id: "gc-1",
                    code: "GIFT-1",
                    amount: 100000,
                    isUsed: false,
                },
                {
                    id: "gc-2",
                    code: "GIFT-2",
                    amount: 50000,
                    isUsed: true,
                },
            ];

            (giftcardServices.getAllGiftCards as jest.Mock).mockResolvedValue(
                mockGiftCards
            );

            const token = generateToken(adminPayload);
            const res = await request(app)
                .get("/giftcards")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(res.body[0].code).toBe("GIFT-1");
        });

        it("should reject non-admin users", async () => {
            const token = generateToken(userPayload);
            const res = await request(app)
                .get("/giftcards")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(403);
        });
    });

    describe("GET /giftcards/:code - Get gift card by code (admin only)", () => {
        it("should return gift card for admin", async () => {
            const mockGiftCard = {
                id: "gc-123",
                code: "GIFT-ABC",
                amount: 100000,
                isUsed: false,
            };

            (giftcardServices.findGiftCardByCode as jest.Mock).mockResolvedValue(
                mockGiftCard
            );

            const token = generateToken(adminPayload);
            const res = await request(app)
                .get("/giftcards/GIFT-ABC")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.code).toBe("GIFT-ABC");
            expect(giftcardServices.findGiftCardByCode).toHaveBeenCalledWith(
                "GIFT-ABC"
            );
        });

        it("should return 404 if gift card not found", async () => {
            (giftcardServices.findGiftCardByCode as jest.Mock).mockResolvedValue(
                null
            );

            const token = generateToken(adminPayload);
            const res = await request(app)
                .get("/giftcards/NONEXISTENT")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Gift card not found");
        });

        it("should reject non-admin users", async () => {
            const token = generateToken(userPayload);
            const res = await request(app)
                .get("/giftcards/GIFT-ABC")
                .set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(403);
        });
    });

    describe("POST /giftcards/redeem - Redeem gift card", () => {
        it("should allow user to redeem valid gift card", async () => {
            const mockResult = {
                giftCard: {
                    code: "GIFT-REDEEM",
                    amount: 100000,
                    usedAt: new Date(),
                },
                wallet: {
                    balance: 200000,
                },
                transaction: {
                    id: "tx-123",
                    amount: 100000,
                },
            };

            (giftcardServices.redeemGiftCard as jest.Mock).mockResolvedValue(
                mockResult
            );

            const token = generateToken(userPayload);
            const res = await request(app)
                .post("/giftcards/redeem")
                .set("Authorization", `Bearer ${token}`)
                .send({ code: "GIFT-REDEEM" });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Gift card redeemed successfully");
            expect(res.body.wallet.balance).toBe(200000);
            expect(giftcardServices.redeemGiftCard).toHaveBeenCalledWith(
                "GIFT-REDEEM",
                "user-123"
            );
        });

        it("should reject request without code", async () => {
            const token = generateToken(userPayload);
            const res = await request(app)
                .post("/giftcards/redeem")
                .set("Authorization", `Bearer ${token}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Gift card code is required");
        });

        it("should return 400 if gift card not found", async () => {
            (giftcardServices.redeemGiftCard as jest.Mock).mockRejectedValue(
                new Error("Gift card not found")
            );

            const token = generateToken(userPayload);
            const res = await request(app)
                .post("/giftcards/redeem")
                .set("Authorization", `Bearer ${token}`)
                .send({ code: "NONEXISTENT" });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Gift card not found");
        });

        it("should return 400 if gift card already used", async () => {
            (giftcardServices.redeemGiftCard as jest.Mock).mockRejectedValue(
                new Error("Gift card already used")
            );

            const token = generateToken(userPayload);
            const res = await request(app)
                .post("/giftcards/redeem")
                .set("Authorization", `Bearer ${token}`)
                .send({ code: "USED-CARD" });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Gift card already used");
        });

        it("should reject unauthenticated requests", async () => {
            const res = await request(app)
                .post("/giftcards/redeem")
                .send({ code: "GIFT-ABC" });

            expect(res.status).toBe(401);
        });
    });
});
