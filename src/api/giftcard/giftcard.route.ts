import express, { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { isAuthenticated, requireRole } from "../../middlewares/middlewares";
import {
    createGiftCard,
    findGiftCardByCode,
    getAllGiftCards,
    redeemGiftCard,
} from "./giftcard.services";
import { Role } from "@prisma/client";

const router = express.Router();

interface AuthenticatedRequest extends Request {
    payload?: JwtPayload;
}

/**
 * POST /giftcards - Create a new gift card (admin only)
 */
router.post(
    "/",
    isAuthenticated,
    requireRole(Role.ADMIN),
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { amount, code } = req.body;

            if (!amount || typeof amount !== "number") {
                return res.status(400).json({
                    error: "Amount is required and must be a number",
                });
            }

            if (amount <= 0) {
                return res.status(400).json({
                    error: "Amount must be positive",
                });
            }

            const giftCard = await createGiftCard(amount, code);

            res.status(201).json(giftCard);
        } catch (error: any) {
            if (error.message === "Gift card code already exists") {
                return res.status(409).json({ error: error.message });
            }
            next(error);
        }
    }
);

/**
 * GET /giftcards - Get all gift cards (admin only)
 */
router.get(
    "/",
    isAuthenticated,
    requireRole(Role.ADMIN),
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const giftCards = await getAllGiftCards();
            res.json(giftCards);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /giftcards/:code - Get gift card by code (admin only)
 */
router.get(
    "/:code",
    isAuthenticated,
    requireRole(Role.ADMIN),
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { code } = req.params;

            if (!code) {
                return res.status(400).json({ error: "Code parameter is required" });
            }

            const giftCard = await findGiftCardByCode(code);

            if (!giftCard) {
                return res.status(404).json({ error: "Gift card not found" });
            }

            res.json(giftCard);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * POST /giftcards/redeem - Redeem a gift card (authenticated users)
 */
router.post(
    "/redeem",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { code } = req.body;
            const { userId } = req.payload!;

            if (!code) {
                return res.status(400).json({
                    error: "Gift card code is required",
                });
            }

            const result = await redeemGiftCard(code, userId);

            res.json({
                message: "Gift card redeemed successfully",
                giftCard: {
                    code: result.giftCard.code,
                    amount: result.giftCard.amount,
                    usedAt: result.giftCard.usedAt,
                },
                wallet: {
                    balance: result.wallet.balance,
                },
                transaction: result.transaction,
            });
        } catch (error: any) {
            if (
                error.message === "Gift card not found" ||
                error.message === "Gift card already used"
            ) {
                return res.status(400).json({ error: error.message });
            }
            next(error);
        }
    }
);

export = router;
