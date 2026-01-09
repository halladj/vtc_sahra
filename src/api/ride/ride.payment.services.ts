import { db } from "../../utils/db";
import { creditWallet, debitWallet, getWalletBalance } from "../wallet/wallet.services";

/**
 * Configuration for ride payments
 * Note: Cash-only model - driver pays commission/penalty to platform
 */
const PAYMENT_CONFIG = {
    COMMISSION_PERCENT: 0.10, // 10% platform commission from driver on completion
    CANCELLATION_PENALTY_PERCENT: 0.05, // 5% penalty when driver cancels
};

/**
 * Process driver commission for a completed ride (cash payment model)
 * Driver pays 2% commission to the platform
 */
export async function processDriverCommission(
    rideId: string,
    driverId: string,
    ridePrice: number
) {
    // Calculate commission (2% of ride price)
    const commissionAmount = Math.floor(ridePrice * PAYMENT_CONFIG.COMMISSION_PERCENT);

    // Process commission in a transaction
    const result = await db.$transaction(async (tx) => {
        // 1. Debit driver's wallet for commission
        const driverDebit = await debitWallet(
            driverId,
            commissionAmount,
            `Platform commission: ${rideId}`
        );

        // 2. Create commission record
        const commission = await tx.commission.create({
            data: {
                rideId,
                percent: PAYMENT_CONFIG.COMMISSION_PERCENT,
                amount: commissionAmount,
            },
        });

        return {
            driverTransaction: driverDebit.transaction,
            commission,
            driverBalance: driverDebit.wallet.balance,
            commissionAmount,
        };
    });

    return result;
}

/**
 * Process cancellation penalty for driver-initiated cancellations
 * Driver pays 5% penalty when they cancel
 */
export async function processDriverCancellationPenalty(
    rideId: string,
    driverId: string,
    ridePrice: number
) {
    // Use cancellation penalty rate (5%)
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
 * Check if driver has sufficient balance for commission
 */
export async function validateDriverBalance(
    driverId: string,
    ridePrice: number
): Promise<{ valid: boolean; balance: number; commissionRequired: number; message?: string }> {
    const balance = await getWalletBalance(driverId);
    const commissionRequired = Math.floor(ridePrice * PAYMENT_CONFIG.COMMISSION_PERCENT);

    if (balance < commissionRequired) {
        return {
            valid: false,
            balance,
            commissionRequired,
            message: `Insufficient balance for commission. Required: ${commissionRequired}, Available: ${balance}`,
        };
    }

    return {
        valid: true,
        balance,
        commissionRequired,
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
