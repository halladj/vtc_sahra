import { db } from "../../../utils/db";
import * as walletServices from "../../wallet/wallet.services";
import {
    processRidePayment,
    processDriverCancellationPenalty,
    validatePassengerBalance,
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

describe("Ride Payment Services", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("processRidePayment", () => {
        it("should process payment successfully with sufficient balance", async () => {
            const rideId = "ride-123";
            const passengerId = "passenger-123";
            const driverId = "driver-123";
            const ridePrice = 100000; // 1000 DA

            const mockPassengerDebit = {
                wallet: { balance: 50000 },
                transaction: { id: "tx-1", amount: 100000 },
            };

            const mockDriverCredit = {
                wallet: { balance: 85000 },
                transaction: { id: "tx-2", amount: 85000 },
            };

            const mockCommission = {
                id: "comm-1",
                rideId,
                percent: 0.15,
                amount: 15000,
            };

            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(150000);
            (walletServices.debitWallet as jest.Mock).mockResolvedValue(mockPassengerDebit);
            (walletServices.creditWallet as jest.Mock).mockResolvedValue(mockDriverCredit);

            (db.$transaction as jest.Mock).mockImplementation(async (callback) => {
                const tx = {
                    commission: {
                        create: jest.fn().mockResolvedValue(mockCommission),
                    },
                };
                return callback(tx);
            });

            const result = await processRidePayment(rideId, passengerId, driverId, ridePrice);

            expect(walletServices.getWalletBalance).toHaveBeenCalledWith(passengerId);
            expect(walletServices.debitWallet).toHaveBeenCalledWith(
                passengerId,
                100000,
                `Ride payment: ${rideId}`
            );
            expect(walletServices.creditWallet).toHaveBeenCalledWith(
                driverId,
                85000, // 100000 - 15% commission
                `Ride earnings: ${rideId}`
            );
            expect(result.passengerBalance).toBe(50000);
            expect(result.driverBalance).toBe(85000);
            expect(result.commission.amount).toBe(15000);
        });

        it("should throw error if passenger has insufficient balance", async () => {
            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(50000);

            await expect(
                processRidePayment("ride-123", "passenger-123", "driver-123", 100000)
            ).rejects.toThrow("Insufficient balance to complete ride");
        });

        it("should calculate commission correctly", async () => {
            const ridePrice = 100000; // 1000 DA
            const expectedCommission = 15000; // 15%
            const expectedDriverPayment = 85000; // 85%

            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(150000);
            (walletServices.debitWallet as jest.Mock).mockResolvedValue({
                wallet: { balance: 50000 },
                transaction: { id: "tx-1" },
            });
            (walletServices.creditWallet as jest.Mock).mockResolvedValue({
                wallet: { balance: 85000 },
                transaction: { id: "tx-2" },
            });

            (db.$transaction as jest.Mock).mockImplementation(async (callback) => {
                const tx = {
                    commission: {
                        create: jest.fn().mockImplementation((data) => data.data),
                    },
                };
                return callback(tx);
            });

            await processRidePayment("ride-123", "passenger-123", "driver-123", ridePrice);

            expect(walletServices.creditWallet).toHaveBeenCalledWith(
                "driver-123",
                expectedDriverPayment,
                expect.any(String)
            );
        });
    });

    describe("processDriverCancellationPenalty", () => {
        it("should deduct full penalty when driver has sufficient balance", async () => {
            const rideId = "ride-123";
            const driverId = "driver-123";
            const ridePrice = 100000; // 1000 DA
            const expectedPenalty = 10000; // 10%

            const mockDebit = {
                wallet: { balance: 40000 },
                transaction: { id: "tx-1", amount: 10000 },
            };

            (walletServices.debitWallet as jest.Mock).mockResolvedValue(mockDebit);

            const result = await processDriverCancellationPenalty(rideId, driverId, ridePrice);

            expect(walletServices.debitWallet).toHaveBeenCalledWith(
                driverId,
                expectedPenalty,
                `Cancellation penalty: ${rideId}`
            );
            expect(result.penaltyCharged).toBe(10000);
            expect(result.driverBalance).toBe(40000);
            expect(result.partial).toBeUndefined();
        });

        it("should deduct partial penalty when driver has insufficient balance", async () => {
            const rideId = "ride-123";
            const driverId = "driver-123";
            const ridePrice = 100000;

            // First call throws insufficient balance error
            (walletServices.debitWallet as jest.Mock)
                .mockRejectedValueOnce(new Error("Insufficient balance"))
                .mockResolvedValueOnce({
                    wallet: { balance: 0 },
                    transaction: { id: "tx-1", amount: 5000 },
                });

            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(5000);

            const result = await processDriverCancellationPenalty(rideId, driverId, ridePrice);

            expect(walletServices.getWalletBalance).toHaveBeenCalledWith(driverId);
            expect(walletServices.debitWallet).toHaveBeenCalledWith(
                driverId,
                5000,
                `Partial cancellation penalty: ${rideId}`
            );
            expect(result.penaltyCharged).toBe(5000);
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

        it("should calculate penalty as 10% of ride price", async () => {
            const ridePrice = 50000; // 500 DA
            const expectedPenalty = 5000; // 50 DA (10%)

            (walletServices.debitWallet as jest.Mock).mockResolvedValue({
                wallet: { balance: 45000 },
                transaction: { id: "tx-1" },
            });

            await processDriverCancellationPenalty("ride-123", "driver-123", ridePrice);

            expect(walletServices.debitWallet).toHaveBeenCalledWith(
                "driver-123",
                expectedPenalty,
                expect.any(String)
            );
        });
    });

    describe("validatePassengerBalance", () => {
        it("should return valid when passenger has sufficient balance", async () => {
            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(150000);

            const result = await validatePassengerBalance("passenger-123", 100000);

            expect(result.valid).toBe(true);
            expect(result.balance).toBe(150000);
            expect(result.message).toBeUndefined();
        });

        it("should return invalid when passenger has insufficient balance", async () => {
            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(50000);

            const result = await validatePassengerBalance("passenger-123", 100000);

            expect(result.valid).toBe(false);
            expect(result.balance).toBe(50000);
            expect(result.message).toContain("Insufficient balance");
            expect(result.message).toContain("Required: 100000");
            expect(result.message).toContain("Available: 50000");
        });

        it("should return valid when balance exactly matches price", async () => {
            (walletServices.getWalletBalance as jest.Mock).mockResolvedValue(100000);

            const result = await validatePassengerBalance("passenger-123", 100000);

            expect(result.valid).toBe(true);
            expect(result.balance).toBe(100000);
        });
    });

    describe("getPaymentConfig", () => {
        it("should return payment configuration", () => {
            const config = getPaymentConfig();

            expect(config).toHaveProperty("commissionPercent");
            expect(config).toHaveProperty("cancellationPenaltyPercent");
            expect(config.commissionPercent).toBe(0.15);
            expect(config.cancellationPenaltyPercent).toBe(0.10);
        });
    });
});
