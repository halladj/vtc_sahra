import { DocumentType, VerificationStatus } from "@prisma/client";
import { db } from "../../utils/db";

/**
 * Create a verification record for a user.
 */
export async function createVerification(
  userId: string,
  documentType: DocumentType,
  documentUrl: string
) {
  return db.verification.create({
    data: {
      userId,
      documentType,
      documentUrl,
      status: VerificationStatus.PENDING,
    },
  });
}

/**
 * Get all verification documents for a user.
 */
export async function getUserVerifications(userId: string) {
  return db.verification.findMany({
    where: { userId },
  });
}

/**
 * Update the status of a verification document.
 * Typically used by an admin.
 */
export async function reviewVerification(
  id: string,
  status: VerificationStatus,
  reviewedBy: string
) {
  return db.verification.update({
    where: { id },
    data: {
      status,
      reviewedBy,
      reviewedAt: new Date(),
    },
  });
}
