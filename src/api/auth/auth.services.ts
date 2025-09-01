import { db } from '../../utils/db';
import { hashToken } from '../../utils/hashToken';

// used when we create a refresh token.
export function addRefreshTokenToWhitelist({ refreshToken, userId }:any) {
  return db.refreshToken.create({
    data: {
      hashedToken: hashToken(refreshToken),
      userId,
      expireAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
    },
  });
}

// used to check if the token sent by the client is in the database.
export function findRefreshToken(token:any) {
  return db.refreshToken.findUnique({
    where: {
      hashedToken: hashToken(token),
    },
  });
}

// soft delete tokens after usage.
export function deleteRefreshTokenById(id:any) {
  return db.refreshToken.update({
    where: {
      id,
    },
    data: {
      revoked: true,
    },
  });
}

export function revokeTokens(userId:any) {
  return db.refreshToken.updateMany({
    where: {
      userId,
    },
    data: {
      revoked: true,
    },
  });
}
