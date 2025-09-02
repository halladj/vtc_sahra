import express from 'express';
import bcrypt from 'bcrypt';
import { addRefreshTokenToWhitelist, findRefreshToken, deleteRefreshTokenById, revokeTokens } from './auth.services';
import { createUserByEmailAndPassword, findUserByEmail, findUserById } from '../user/user.services';
import { generateTokens } from '../../utils/jwt';
import { Role } from '../../generated/prisma';
import { upload } from '../../middlewares';

const router = express.Router();

router.post(
  '/register',
  upload.single('photo'), 
  async (req, res, next) => {
  try {
    const { email, password,  address } = req.body;
    if (!email || !password) {
      res.status(400);
      throw new Error('You must provide an email and a password.');
    }

    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      res.status(400);
      throw new Error('Email already in use.');
    }
    const photoUrl = req.file ? `/uploads/users/${req.file.filename}` : null;

    const user = await createUserByEmailAndPassword({
       email, 
       password,
       role: Role.USER,
       photo: photoUrl? photoUrl : "",
       address
      });
    const { accessToken, refreshToken } = generateTokens(user);
    await addRefreshTokenToWhitelist({ refreshToken, userId: user.id });

    res.json({
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400);
      throw new Error('You must provide an email and a password.');
    }

    const existingUser = await findUserByEmail(email);

    if (!existingUser) {
      res.status(403);
      throw new Error('Invalid login credentials.');
    }

    const validPassword = await bcrypt.compare(password, existingUser.password);
    if (!validPassword) {
      res.status(403);
      throw new Error('Invalid login credentials.');
    }

    const { accessToken, refreshToken } = generateTokens(existingUser);
    await addRefreshTokenToWhitelist({ refreshToken, userId: existingUser.id });

    res.json({
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refreshToken', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400);
      throw new Error('Missing refresh token.');
    }
    const savedRefreshToken = await findRefreshToken(refreshToken);
    console.log({
      expireAt: savedRefreshToken!.expireAt,
      now: new Date(),
      isExpired: Date.now() >= savedRefreshToken!.expireAt.getTime(),
    });

    if (
      !savedRefreshToken
      || savedRefreshToken.revoked === true
      || Date.now() >= savedRefreshToken.expireAt.getTime()
    ) {
      res.status(401);
      throw new Error('Unauthorized');
    }

    const user = await findUserById(savedRefreshToken.userId);
    if (!user) {
      res.status(401);
      throw new Error('Unauthorized');
    }

    await deleteRefreshTokenById(savedRefreshToken.id);
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    await addRefreshTokenToWhitelist({
      refreshToken: newRefreshToken,
      userId: user.id,
    });

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// This endpoint is only for demo purpose.
// Move this logic where you need to revoke the tokens( for ex, on password reset)
router.post('/revokeRefreshTokens', async (req, res, next) => {
  try {
    const { userId } = req.body;
    await revokeTokens(userId);
    res.json({ message: `Tokens revoked for user with id #${userId}` });
  } catch (err) {
    next(err);
  }
});

export = router;