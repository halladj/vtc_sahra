import { db } from "../../../utils/db";
import {
    createGiftCard,
    findGiftCardByCode,
    getAllGiftCards,
    validateGiftCard,
    redeemGiftCard,
} from "../giftcard.services";
import * as walletServices from "../../wallet/wallet.services";

// Mock the database
jest.mock("../../../utils/db", () => ({
    db: {
        giftCard: {
            create: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

// Mock wallet services
jest.mock("../../wallet/wallet.services");

describe("Gift Card Services", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("createGiftCard", () => {
        it("should create a gift card with auto-generated code", async () => {
            const mockGiftCard = {
                id: "gc-123",
                code: "GIFT-ABCD1234",
                amount: 100000,
                isUsed: false,
                usedBy: null,
                usedAt: null,
            };

            (db.giftCard.findUnique as jest.Mock).mockResolvedValue(null);
            (db.giftCard.create as jest.Mock).mockResolvedValue(mockGiftCard);

            const result = await createGiftCard(100000);

            expect(result.amount).toBe(100000);
            expect(result.isUsed).toBe(false);
            expect(db.giftCard.create).toHaveBeenCalled();
        });

        it("should create a gift card with custom code", async () => {
            const customCode = "CUSTOM-CODE-123";
            const mockGiftCard = {
                id: "gc-123",
                code: customCode,
                amount: 50000,
                isUsed: false,
                usedBy: null,
                usedAt: null,
            };

            (db.giftCard.findUnique as jest.Mock).mockResolvedValue(null);
            (db.giftCard.create as jest.Mock).mockResolvedValue(mockGiftCard);

            const result = await createGiftCard(50000, customCode);

            expect(result.code).toBe(customCode);
            expect(db.giftCard.create).toHaveBeenCalledWith({
                data: {
                    code: customCode,
                    amount: 50000,
                    isUsed: false,
                },
            });
        });

        it("should throw error for negative amount", async () => {
            await expect(createGiftCard(-1000)).rejects.toThrow(
                "Amount must be positive"
            );
        });

        it("should throw error for zero amount", async () => {
            await expect(createGiftCard(0)).rejects.toThrow(
                "Amount must be positive"
            );
        });

        it("should throw error if code already exists", async () => {
            const existingCode = "EXISTING-CODE";
            (db.giftCard.findUnique as jest.Mock).mockResolvedValue({
                id: "existing-gc",
                code: existingCode,
            });

            await expect(createGiftCard(100000, existingCode)).rejects.toThrow(
                "Gift card code already exists"
            );
        });
    });

    describe("findGiftCardByCode", () => {
        it("should return gift card if found", async () => {
            const mockGiftCard = {
                id: "gc-123",
                code: "GIFT-ABC",
                amount: 100000,
                isUsed: false,
            };

            (db.giftCard.findUnique as jest.Mock).mockResolvedValue(mockGiftCard);

            const result = await findGiftCardByCode("GIFT-ABC");

            expect(result).toEqual(mockGiftCard);
            expect(db.giftCard.findUnique).toHaveBeenCalledWith({
                where: { code: "GIFT-ABC" },
            });
        });

        it("should return null if not found", async () => {
            (db.giftCard.findUnique as jest.Mock).mockResolvedValue(null);

            const result = await findGiftCardByCode("NONEXISTENT");

            expect(result).toBeNull();
        });
    });

    describe("getAllGiftCards", () => {
        it("should return all gift cards ordered by usage", async () => {
            const mockGiftCards = [
                { id: "gc-1", code: "GIFT-1", isUsed: false },
                { id: "gc-2", code: "GIFT-2", isUsed: true },
            ];

            (db.giftCard.findMany as jest.Mock).mockResolvedValue(mockGiftCards);

            const result = await getAllGiftCards();

            expect(result).toEqual(mockGiftCards);
            expect(db.giftCard.findMany).toHaveBeenCalledWith({
                orderBy: { isUsed: "asc" },
            });
        });
    });

    describe("validateGiftCard", () => {
        it("should return valid for unused gift card", async () => {
            const mockGiftCard = {
                id: "gc-123",
                code: "GIFT-VALID",
                amount: 100000,
                isUsed: false,
            };

            (db.giftCard.findUnique as jest.Mock).mockResolvedValue(mockGiftCard);

            const result = await validateGiftCard("GIFT-VALID");

            expect(result.valid).toBe(true);
            expect(result.giftCard).toEqual(mockGiftCard);
        });

        it("should return invalid if gift card not found", async () => {
            (db.giftCard.findUnique as jest.Mock).mockResolvedValue(null);

            const result = await validateGiftCard("NONEXISTENT");

            expect(result.valid).toBe(false);
            expect(result.message).toBe("Gift card not found");
        });

        it("should return invalid if gift card already used", async () => {
            const mockGiftCard = {
                id: "gc-123",
                code: "GIFT-USED",
                amount: 100000,
                isUsed: true,
            };

            (db.giftCard.findUnique as jest.Mock).mockResolvedValue(mockGiftCard);

            const result = await validateGiftCard("GIFT-USED");

            expect(result.valid).toBe(false);
            expect(result.message).toBe("Gift card already used");
        });
    });

    describe("redeemGiftCard", () => {
        it("should redeem gift card and credit wallet", async () => {
            const mockGiftCard = {
                id: "gc-123",
                code: "GIFT-REDEEM",
                amount: 100000,
                isUsed: false,
                usedBy: null,
                usedAt: null,
            };

            const mockUpdatedGiftCard = {
                ...mockGiftCard,
                isUsed: true,
                usedBy: "user-123",
                usedAt: new Date(),
            };

            const mockWalletResult = {
                wallet: { id: "wallet-123", balance: 200000 },
                transaction: { id: "tx-123", amount: 100000 },
            };

            (db.giftCard.findUnique as jest.Mock).mockResolvedValue(mockGiftCard);
            (db.$transaction as jest.Mock).mockImplementation(async (callback) => {
                return callback({
                    giftCard: {
                        update: jest.fn().mockResolvedValue(mockUpdatedGiftCard),
                    },
                });
            });
            (walletServices.creditWallet as jest.Mock).mockResolvedValue(
                mockWalletResult
            );

            const result = await redeemGiftCard("GIFT-REDEEM", "user-123");

            expect(result.giftCard.isUsed).toBe(true);
            expect(result.giftCard.usedBy).toBe("user-123");
            expect(walletServices.creditWallet).toHaveBeenCalledWith(
                "user-123",
                100000,
                "Gift card redemption: GIFT-REDEEM"
            );
        });

        it("should throw error if gift card not found", async () => {
            (db.giftCard.findUnique as jest.Mock).mockResolvedValue(null);

            await expect(
                redeemGiftCard("NONEXISTENT", "user-123")
            ).rejects.toThrow("Gift card not found");
        });

        it("should throw error if gift card already used", async () => {
            const mockGiftCard = {
                id: "gc-123",
                code: "GIFT-USED",
                amount: 100000,
                isUsed: true,
            };

            (db.giftCard.findUnique as jest.Mock).mockResolvedValue(mockGiftCard);

            await expect(redeemGiftCard("GIFT-USED", "user-123")).rejects.toThrow(
                "Gift card already used"
            );
        });
    });
});
