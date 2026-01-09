import { db } from "../../../utils/db";
import * as walletServices from "../../wallet/wallet.services";
import {
    processDriverCommission,
    processDriverCancellationPenalty,
    validateDriverBalance,
    getPaymentConfig,
} from "../ride.payment.services";

// Mock the database
jest.mock("../../../utils/db", () => ({
    db: {
        $transaction: jest.fn(),
        commission: {
            create: jest.fn(),
        },
    },
}));

// Mock wallet services
jest.mock("../../wallet/wallet.services");

describe("Ride Payment Services - Cash Only Model", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("processDriverCommission", () => {
        it("should process 10% commission from driver on ride completion", async () => {
            const rideId = "ride-123";
            const driverId = "driver-123";
            const ridePrice = 100000; // 1000 DA
            const expectedCommission = 10000; // 10% of 100000

            const mockDriverDebit = {
                wallet: { balance: 90000 },
                transaction: { id: "tx-1", amount: 10000 },
            };

            const mockCommission = {
                id: "comm-1",
                rideId,
                percent: 0.10,
                amount: 10000,
            };

            (walletServices.debitWallet as jest.Mock).mockResolvedValue(mockDriverDebit);

            (db.$transaction as jest.Mock).mockImplementation(async (callback) => {
                const tx = {
                    commission: {
                        create: jest.fn().mockResolvedValue(mockCommission),
                    },
                };
                return callback(tx);
            });

            const result = await processDriverCommission(rideId, driverId, ridePrice);

            expect(walletServices.debitWallet).toHaveBeenCalledWith(
                driverId,
                expectedCommission,
                `Platform commission: ${rideId}`
            );
            expect(result.driverBalance).toBe(90000);
            expect(result.commissionAmount).toBe(10000);
        });

        it("should calculate 10% commission correctly for various ride prices", async () => {
            const testCases = [
                { ridePrice: 50000, expectedCommission: 5000 },    // 500 DA -> 50 DA
                { ridePrice: 100000, expectedCommission: 10000 },  // 1000 DA -> 100 DA
                { ridePrice: 250000, expectedCommission: 25000 },  // 2500 DA -> 250 DA
            ];

            for (const { ridePrice, expectedCommission } of testCases) {
                jest.clearAllMocks();

                (walletServices.debitWallet as jest.Mock).mockResolvedValue({
                    wallet: { balance: 100000 },
                    transaction: { id: "tx-1" },
                });

                (db.$transaction as jest.Mock).mockImplementation(async (callback) => {
                    const tx = {
                        commission: {
                            create: jest.fn().mockImplementation((data) => data.data),
                        },
                    };
                    return callback(tx);
                });

                await processDriverCommission("ride-123", "driver-123", ridePrice);

                expect(walletServices.debitWallet).toHaveBeenCalledWith(
                    "driver-123",
                    expectedCommission,
                    expect.any(String)
                );
            }
        });
    });

    describe("processDriverCancellationPenalty", () => {
        it("should charge driver 5% when driver cancels accepted ride", async () => {
            const rideId = "ride-123";
            const driverId = "driver-123";
            const ridePrice = 100000; // 1000 DA
            const expectedPenalty = 5000; // 5% of 100000

            const mockDebit = {
                wallet: { balance: 95000 },
                transaction: { id: "tx-1", amount: 5000 },
            };

            (walletServices.debitWallet as jest.Mock).mockResolvedValue(mockDebit);

            const result = await processDriverCancellationPenalty(rideId, driverId, ridePrice);

            expect(walletServices.debitWallet).toHaveBeenCalledWith(
                driverId,
                expectedPenalty,
                `Cancellation penalty: ${rideId}`
            );
            expect(result.penaltyCharged).toBe(5000);
            expect(result.driverBalance).toBe(95000);
        });

        it("should calculate 5% penalty correctly for various ride prices", async () => {
            const testCases = [
                { ridePrice: 50000, expectedPenalty: 2500 },    // 500 DA -> 25 DA
                { ridePrice: 100000, expectedPenalty: 5000 },   // 1000 DA -> 50 DA
                { ridePrice: 200000, expectedPenalty: 10000 },  // 2000 DA -> 100 DA
            ];

            for (const { ridePrice, expectedPenalty } of testCases) {
                jest.clearAllMocks();

                (walletServices.debitWallet as jest.Mock).mockResolvedValue({
                    wallet: { balance: 100000 },
                    transaction: { id: "tx-1" },
                });

                await processDriverCancellationPenalty("ride-123", "driver-123", ridePrice);

                expect(walletServices.debitWallet).toHaveBeenCalledWith(
                    "driver-123",
                    expectedPenalty,
                    expect.any(String)
                );
            }
        });

        it("should deduct partial amount when driver has insufficient balance", async () => {
            const rideId = "ride-123";
            const driverId = "driver-123";
            const ridePrice = 100000;

            // First call throws insufficient balance error
            (walletServices.debitWallet as jest.Mock)
                .mockRejectedValueOnce(new Error("Insufficient balance"))
                .mockResolvedValueOnce({
                    wallet: { balance: 0 },
                    transaction: { id: "tx-1", amount: 3000 },
                });

            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(3000);

            const result = await processDriverCancellationPenalty(rideId, driverId, ridePrice);

            expect(walletServices.getWalletBalance).toHaveBeenCalledWith(driverId);
            expect(walletServices.debitWallet).toHaveBeenCalledWith(
                driverId,
                3000,
                `Partial cancellation penalty: ${rideId}`
            );
            expect(result.penaltyCharged).toBe(3000);
            expect(result.driverBalance).toBe(0);
            expect(result.partial).toBe(true);
        });

        it("should handle driver with zero balance", async () => {
            (walletServices.debitWallet as jest.Mock).mockRejectedValue(
                new Error("Insufficient balance")
            );
            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(0);

            const result = await processDriverCancellationPenalty(
                "ride-123",
                "driver-123",
                100000
            );

            expect(result.penaltyCharged).toBe(0);
            expect(result.driverBalance).toBe(0);
            expect(result.partial).toBe(true);
            expect(result.transaction).toBeNull();
        });
    });

    describe("validateDriverBalance", () => {
        it("should return valid when driver has sufficient balance for commission", async () => {
            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(15000);

            const result = await validateDriverBalance("driver-123", 100000); // 10% = 10000

            expect(result.valid).toBe(true);
            expect(result.balance).toBe(15000);
            expect(result.commissionRequired).toBe(10000);
        });

        it("should return invalid when driver has insufficient balance for commission", async () => {
            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(5000);

            const result = await validateDriverBalance("driver-123", 100000); // 10% = 10000

            expect(result.valid).toBe(false);
            expect(result.balance).toBe(5000);
            expect(result.commissionRequired).toBe(10000);
            expect(result.message).toContain("Insufficient balance for commission");
        });

        it("should return valid when balance exactly matches commission", async () => {
            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(10000);

            const result = await validateDriverBalance("driver-123", 100000); // 10% = 10000

            expect(result.valid).toBe(true);
            expect(result.balance).toBe(10000);
            expect(result.commissionRequired).toBe(10000);
        });
    });

    describe("getPaymentConfig", () => {
        it("should return payment configuration with 10% commission and 5% cancellation penalty", () => {
            const config = getPaymentConfig();

            expect(config).toHaveProperty("commissionPercent");
            expect(config).toHaveProperty("cancellationPenaltyPercent");
            expect(config.commissionPercent).toBe(0.10);
            expect(config.cancellationPenaltyPercent).toBe(0.05);
        });
    });
});
