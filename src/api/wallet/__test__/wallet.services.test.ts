import { TransactionType } from "@prisma/client";
import { db } from "../../../utils/db";
import {
    createWallet,
    findWalletByUserId,
    getWalletBalance,
    creditWallet,
    debitWallet,
} from "../wallet.services";

// Mock the database
jest.mock("../../../utils/db", () => ({
    db: {
        wallet: {
            create: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        transaction: {
            create: jest.fn(),
            findMany: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

describe("Wallet Services", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("createWallet", () => {
        it("should create a new wallet with zero balance", async () => {
            const userId = "user-123";
            const mockWallet = {
                id: "wallet-123",
                userId,
                balance: 0,
            };

            (db.wallet.create as jest.Mock).mockResolvedValue(mockWallet);

            const result = await createWallet(userId);

            expect(result).toEqual(mockWallet);
            expect(db.wallet.create).toHaveBeenCalledWith({
                data: {
                    userId,
                    balance: 0,
                },
            });
        });
    });

    describe("findWalletByUserId", () => {
        it("should return wallet with transactions", async () => {
            const userId = "user-123";
            const mockWallet = {
                id: "wallet-123",
                userId,
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

            (db.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);

            const result = await findWalletByUserId(userId);

            expect(result).toEqual(mockWallet);
            expect(db.wallet.findUnique).toHaveBeenCalledWith({
                where: { userId },
                include: {
                    transactions: {
                        orderBy: {
                            createdAt: "desc",
                        },
                    },
                },
            });
        });

        it("should return null if wallet not found", async () => {
            (db.wallet.findUnique as jest.Mock).mockResolvedValue(null);

            const result = await findWalletByUserId("nonexistent-user");

            expect(result).toBeNull();
        });
    });

    describe("getWalletBalance", () => {
        it("should return wallet balance", async () => {
            const userId = "user-123";
            const mockWallet = { balance: 5000 };

            (db.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);

            const result = await getWalletBalance(userId);

            expect(result).toBe(5000);
            expect(db.wallet.findUnique).toHaveBeenCalledWith({
                where: { userId },
                select: {
                    balance: true,
                },
            });
        });

        it("should throw error if wallet not found", async () => {
            (db.wallet.findUnique as jest.Mock).mockResolvedValue(null);

            await expect(getWalletBalance("nonexistent-user")).rejects.toThrow(
                "Wallet not found"
            );
        });
    });

    describe("creditWallet", () => {
        it("should credit wallet and create transaction", async () => {
            const userId = "user-123";
            const amount = 1000;
            const reference = "Top-up";

            const mockWallet = {
                id: "wallet-123",
                userId,
                balance: 5000,
            };

            const mockUpdatedWallet = {
                ...mockWallet,
                balance: 6000,
            };

            const mockTransaction = {
                id: "tx-123",
                walletId: "wallet-123",
                type: TransactionType.CREDIT,
                amount,
                reference,
                createdAt: new Date(),
            };

            (db.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);
            (db.$transaction as jest.Mock).mockResolvedValue([
                mockUpdatedWallet,
                mockTransaction,
            ]);

            const result = await creditWallet(userId, amount, reference);

            expect(result.wallet.balance).toBe(6000);
            expect(result.transaction.amount).toBe(1000);
            expect(result.transaction.type).toBe(TransactionType.CREDIT);
        });

        it("should throw error for negative amount", async () => {
            await expect(creditWallet("user-123", -500)).rejects.toThrow(
                "Amount must be positive"
            );
        });

        it("should throw error for zero amount", async () => {
            await expect(creditWallet("user-123", 0)).rejects.toThrow(
                "Amount must be positive"
            );
        });

        it("should throw error if wallet not found", async () => {
            (db.wallet.findUnique as jest.Mock).mockResolvedValue(null);

            await expect(
                creditWallet("nonexistent-user", 1000)
            ).rejects.toThrow("Wallet not found");
        });
    });

    describe("debitWallet", () => {
        it("should debit wallet and create transaction", async () => {
            const userId = "user-123";
            const amount = 500;
            const reference = "Ride payment";

            const mockWallet = {
                id: "wallet-123",
                userId,
                balance: 5000,
            };

            const mockUpdatedWallet = {
                ...mockWallet,
                balance: 4500,
            };

            const mockTransaction = {
                id: "tx-123",
                walletId: "wallet-123",
                type: TransactionType.DEBIT,
                amount,
                reference,
                createdAt: new Date(),
            };

            (db.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);
            (db.$transaction as jest.Mock).mockResolvedValue([
                mockUpdatedWallet,
                mockTransaction,
            ]);

            const result = await debitWallet(userId, amount, reference);

            expect(result.wallet.balance).toBe(4500);
            expect(result.transaction.amount).toBe(500);
            expect(result.transaction.type).toBe(TransactionType.DEBIT);
        });

        it("should throw error for insufficient balance", async () => {
            const mockWallet = {
                id: "wallet-123",
                userId: "user-123",
                balance: 100,
            };

            (db.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);

            await expect(debitWallet("user-123", 500)).rejects.toThrow(
                "Insufficient balance"
            );
        });

        it("should throw error for negative amount", async () => {
            await expect(debitWallet("user-123", -500)).rejects.toThrow(
                "Amount must be positive"
            );
        });

        it("should throw error for zero amount", async () => {
            await expect(debitWallet("user-123", 0)).rejects.toThrow(
                "Amount must be positive"
            );
        });

        it("should throw error if wallet not found", async () => {
            (db.wallet.findUnique as jest.Mock).mockResolvedValue(null);

            await expect(debitWallet("nonexistent-user", 500)).rejects.toThrow(
                "Wallet not found"
            );
        });
    });
});
