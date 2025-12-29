import { db } from "../../utils/db";
import { creditWallet, debitWallet, getWalletBalance } from "../wallet/wallet.services";

/**
 * Configuration for ride payments
 */
const PAYMENT_CONFIG = {
    COMMISSION_PERCENT: 0.15, // 15% platform commission
    CANCELLATION_PENALTY_PERCENT: 0.10, // 10% penalty for driver cancellation
};

/**
 * Process payment for a completed ride
 * Debits passenger and credits driver (minus commission)
 */
export async function processRidePayment(
    rideId: string,
    passengerId: string,
    driverId: string,
    ridePrice: number
) {
    // Validate passenger has sufficient balance
    const passengerBalance = await getWalletBalance(passengerId);
    if (passengerBalance < ridePrice) {
        throw new Error("Insufficient balance to complete ride");
    }

    // Calculate amounts
    const commissionAmount = Math.floor(ridePrice * PAYMENT_CONFIG.COMMISSION_PERCENT);
    const driverPayment = ridePrice - commissionAmount;

    // Process payments in a transaction
    const result = await db.$transaction(async (tx) => {
        // 1. Debit passenger
        const passengerDebit = await debitWallet(
            passengerId,
            ridePrice,
            `Ride payment: ${rideId}`
        );

        // 2. Credit driver
        const driverCredit = await creditWallet(
            driverId,
            driverPayment,
            `Ride earnings: ${rideId}`
        );

        // 3. Create commission record
        const commission = await tx.commission.create({
            data: {
                rideId,
                percent: PAYMENT_CONFIG.COMMISSION_PERCENT,
                amount: commissionAmount,
            },
        });

        return {
            passengerTransaction: passengerDebit.transaction,
            driverTransaction: driverCredit.transaction,
            commission,
            passengerBalance: passengerDebit.wallet.balance,
            driverBalance: driverCredit.wallet.balance,
        };
    });

    return result;
}

/**
 * Process cancellation penalty for driver-initiated cancellations
 * Debits penalty from driver's wallet
 */
export async function processDriverCancellationPenalty(
    rideId: string,
    driverId: string,
    ridePrice: number
) {
    const penaltyAmount = Math.floor(ridePrice * PAYMENT_CONFIG.CANCELLATION_PENALTY_PERCENT);

    try {
        // Try to debit full penalty
        const result = await debitWallet(
            driverId,
            penaltyAmount,
            `Cancellation penalty: ${rideId}`
        );

        return {
            penaltyCharged: penaltyAmount,
            driverBalance: result.wallet.balance,
            transaction: result.transaction,
        };
    } catch (error: any) {
        // If insufficient balance, debit what's available
        if (error.message === "Insufficient balance") {
            const driverBalance = await getWalletBalance(driverId);

            if (driverBalance > 0) {
                const result = await debitWallet(
                    driverId,
                    driverBalance,
                    `Partial cancellation penalty: ${rideId}`
                );

                return {
                    penaltyCharged: driverBalance,
                    driverBalance: 0,
                    transaction: result.transaction,
                    partial: true,
                };
            }

            // Driver has no balance
            return {
                penaltyCharged: 0,
                driverBalance: 0,
                transaction: null,
                partial: true,
            };
        }

        // Re-throw other errors
        throw error;
    }
}

/**
 * Check if passenger has sufficient balance for a ride
 */
export async function validatePassengerBalance(
    passengerId: string,
    ridePrice: number
): Promise<{ valid: boolean; balance: number; message?: string }> {
    const balance = await getWalletBalance(passengerId);

    if (balance < ridePrice) {
        return {
            valid: false,
            balance,
            message: `Insufficient balance. Required: ${ridePrice}, Available: ${balance}`,
        };
    }

    return {
        valid: true,
        balance,
    };
}

/**
 * Get payment configuration (useful for displaying to users)
 */
export function getPaymentConfig() {
    return {
        commissionPercent: PAYMENT_CONFIG.COMMISSION_PERCENT,
        cancellationPenaltyPercent: PAYMENT_CONFIG.CANCELLATION_PENALTY_PERCENT,
    };
}
