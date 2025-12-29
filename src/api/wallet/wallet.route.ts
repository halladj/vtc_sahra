import express, { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { isAuthenticated, requireRole } from "../../middlewares/middlewares";
import {
    findWalletByUserId,
    creditWallet,
    debitWallet,
} from "./wallet.services";
import { Role } from "@prisma/client";

const router = express.Router();

interface AuthenticatedRequest extends Request {
    payload?: JwtPayload;
}

/**
 * GET /wallet - Get current user's wallet and balance
 */
router.get(
    "/",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { userId } = req.payload!;

            const wallet = await findWalletByUserId(userId);

            if (!wallet) {
                return res.status(404).json({ error: "Wallet not found" });
            }

            res.json(wallet);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /wallet/transactions - Get transaction history
 */
router.get(
    "/transactions",
    isAuthenticated,
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { userId } = req.payload!;

            const wallet = await findWalletByUserId(userId);

            if (!wallet) {
                return res.status(404).json({ error: "Wallet not found" });
            }

            res.json(wallet.transactions);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * POST /wallet/credit - Credit wallet (admin only)
 */
router.post(
    "/credit",
    isAuthenticated,
    requireRole(Role.ADMIN),
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { userId, amount, reference } = req.body;

            if (!userId || amount === undefined) {
                return res.status(400).json({
                    error: "Missing required fields: userId, amount",
                });
            }

            if (typeof amount !== "number" || amount <= 0) {
                return res.status(400).json({
                    error: "Amount must be a positive number",
                });
            }

            const result = await creditWallet(userId, amount, reference);

            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * POST /wallet/debit - Debit wallet (admin only)
 */
router.post(
    "/debit",
    isAuthenticated,
    requireRole(Role.ADMIN),
    async (req: AuthenticatedRequest, res: Response, next: any) => {
        try {
            const { userId, amount, reference } = req.body;

            if (!userId || amount === undefined) {
                return res.status(400).json({
                    error: "Missing required fields: userId, amount",
                });
            }

            if (typeof amount !== "number" || amount <= 0) {
                return res.status(400).json({
                    error: "Amount must be a positive number",
                });
            }

            const result = await debitWallet(userId, amount, reference);

            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

export = router;
