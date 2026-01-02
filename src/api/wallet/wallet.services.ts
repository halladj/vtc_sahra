import { TransactionType } from "@prisma/client";
import { db } from "../../utils/db";

/**
 * Create a new wallet for a user
 */
export async function createWallet(userId: string) {
    return db.wallet.create({
        data: {
            userId,
            balance: 0,
        },
    });
}

/**
 * Find a wallet by user ID
 */
export async function findWalletByUserId(userId: string) {
    return db.wallet.findUnique({
        where: { userId },
        include: {
            transactions: {
                orderBy: {
                    createdAt: "desc",
                },
            },
        },
    });
}

/**
 * Get wallet balance for a user
 */
export async function getWalletBalance(userId: string) {
    const wallet = await db.wallet.findUnique({
        where: { userId },
        select: {
            balance: true,
        },
    });

    if (!wallet) {
        throw new Error("Wallet not found");
    }

    return wallet.balance;
}

/**
 * Add a transaction to a wallet
 */
export async function addTransaction(
    walletId: string,
    type: TransactionType,
    amount: number,
    reference?: string
) {
    return db.transaction.create({
        data: {
            walletId,
            type,
            amount,
            reference: reference ?? null,
        },
    });
}

/**
 * Get transaction history for a wallet
 */
export async function getTransactionHistory(walletId: string) {
    return db.transaction.findMany({
        where: { walletId },
        orderBy: {
            createdAt: "desc",
        },
    });
}

/**
 * Credit wallet (add money)
 */
export async function creditWallet(
    userId: string,
    amount: number,
    reference?: string
) {
    if (amount <= 0) {
        throw new Error("Amount must be positive");
    }

    const wallet = await db.wallet.findUnique({
        where: { userId },
    });

    if (!wallet) {
        throw new Error("Wallet not found");
    }

    // Update wallet balance and create transaction in a transaction
    const [updatedWallet, transaction] = await db.$transaction([
        db.wallet.update({
            where: { userId },
            data: {
                balance: {
                    increment: amount,
                },
            },
        }),
        db.transaction.create({
            data: {
                walletId: wallet.id,
                type: TransactionType.CREDIT,
                amount,
                reference: reference ?? null,
            },
        }),
    ]);

    return { wallet: updatedWallet, transaction };
}

/**
 * Debit wallet (spend money)
 */
export async function debitWallet(
    userId: string,
    amount: number,
    reference?: string
) {
    if (amount <= 0) {
        throw new Error("Amount must be positive");
    }

    const wallet = await db.wallet.findUnique({
        where: { userId },
    });

    if (!wallet) {
        throw new Error("Wallet not found");
    }

    if (wallet.balance < amount) {
        throw new Error("Insufficient balance");
    }

    // Update wallet balance and create transaction in a transaction
    const [updatedWallet, transaction] = await db.$transaction([
        db.wallet.update({
            where: { userId },
            data: {
                balance: {
                    decrement: amount,
                },
            },
        }),
        db.transaction.create({
            data: {
                walletId: wallet.id,
                type: TransactionType.DEBIT,
                amount,
                reference: reference ?? null,
            },
        }),
    ]);

    return { wallet: updatedWallet, transaction };
}
