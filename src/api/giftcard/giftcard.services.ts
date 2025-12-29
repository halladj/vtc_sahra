import { db } from "../../utils/db";
import { creditWallet } from "../wallet/wallet.services";
import crypto from "crypto";

/**
 * Generate a unique gift card code
 */
function generateGiftCardCode(): string {
    const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
    return `GIFT-${randomPart}`;
}

/**
 * Create a new gift card
 */
export async function createGiftCard(amount: number, code?: string) {
    if (amount <= 0) {
        throw new Error("Amount must be positive");
    }

    const giftCardCode = code || generateGiftCardCode();

    // Check if code already exists
    const existing = await db.giftCard.findUnique({
        where: { code: giftCardCode },
    });

    if (existing) {
        throw new Error("Gift card code already exists");
    }

    return db.giftCard.create({
        data: {
            code: giftCardCode,
            amount,
            isUsed: false,
        },
    });
}

/**
 * Find a gift card by code
 */
export async function findGiftCardByCode(code: string) {
    return db.giftCard.findUnique({
        where: { code },
    });
}

/**
 * Get all gift cards (admin only)
 */
export async function getAllGiftCards() {
    return db.giftCard.findMany({
        orderBy: {
            isUsed: "asc", // Show unused first
        },
    });
}

/**
 * Validate if a gift card is valid and unused
 */
export async function validateGiftCard(code: string) {
    const giftCard = await findGiftCardByCode(code);

    if (!giftCard) {
        return { valid: false, message: "Gift card not found" };
    }

    if (giftCard.isUsed) {
        return { valid: false, message: "Gift card already used" };
    }

    return { valid: true, giftCard };
}

/**
 * Redeem a gift card and credit the user's wallet
 */
export async function redeemGiftCard(code: string, userId: string) {
    // Validate gift card
    const validation = await validateGiftCard(code);

    if (!validation.valid) {
        throw new Error(validation.message);
    }

    const giftCard = validation.giftCard!;

    // Use a transaction to ensure atomicity
    const result = await db.$transaction(async (tx) => {
        // Mark gift card as used
        const updatedGiftCard = await tx.giftCard.update({
            where: { code },
            data: {
                isUsed: true,
                usedBy: userId,
                usedAt: new Date(),
            },
        });

        // Credit the user's wallet
        const walletResult = await creditWallet(
            userId,
            giftCard.amount,
            `Gift card redemption: ${code}`
        );

        return {
            giftCard: updatedGiftCard,
            wallet: walletResult.wallet,
            transaction: walletResult.transaction,
        };
    });

    return result;
}
