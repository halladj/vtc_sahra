import express from 'express';
import bcrypt from 'bcrypt';
import { addRefreshTokenToWhitelist, findRefreshToken, deleteRefreshTokenById, revokeTokens, createPasswordResetToken, findPasswordResetToken, deletePasswordResetToken } from './auth.services';
import { createUserByEmailAndPassword, findUserByEmail, findUserById, updateUsersPassword } from '../user/user.services';
import { generateTokens } from '../../utils/jwt';
import { Role, VehicleType } from '../../generated/prisma';
import { upload } from '../../middlewares';
import { createDriverByEmailAndPassword } from '../driver/driver.services';
import crypto from "crypto";


const router = express.Router();

router.post(
  '/register',
  upload.single('photo'), 
  async (req, res, next) => {
  try {
    const { 
      email, 
      password, 
      phoneNumber, 
      firstName, 
      lastName, 
      sex, 
      dateOfBirth, 
      address, 
      wilaya, 
      commune 
    } = req.body;

    if (!email || !password || !phoneNumber) {
      res.status(400);
      throw new Error('You must provide an email, a phone number and a password.');
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
       address,
       phoneNumber,
       firstName,
       lastName,
       sex,
       dateOfBirth,
       wilaya,
       commune
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


router.post(
  '/register-driver', 
  upload.single('photo'), 
  async (req, res, next) => {
    try {
      const { 
        email,
        password,
        phoneNumber,
        firstName,
        lastName,
        sex,
        dateOfBirth,
        address,
        wilaya,
        commune,
        vehicle
      } = req.body;
      if (!email || !password) {
        res.status(400);
        throw new Error('You must provide an email and a password.');
      } 
      //TODO: is Vehicle validation a need on backend ?.

      const existingUser = await findUserByEmail(email);
      if (existingUser) {
        res.status(400);
        throw new Error('Email already in use.');
      }

      const photoUrl = req.file ? `/uploads/users/${req.file.filename}` : null;
      const driver = await createDriverByEmailAndPassword({
        email,
        password,
        phoneNumber,
        firstName,
        lastName,
        sex,
        dateOfBirth,
        address,
        wilaya,
        commune,
        photo: photoUrl? photoUrl :  "",
        vehicle

      });
      const { accessToken, refreshToken } = generateTokens(driver);
      await addRefreshTokenToWhitelist({ refreshToken, userId: driver.id });

      res.json({
        accessToken,
        refreshToken,
      });

    } catch (error) {
      next(error)
    }
  }
 
)

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


router.post("/forgot-password", async (req,res,next) => {
    try{

      const { email } = req.body;

      const user = await findUserByEmail(email); 
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 1000 * 60 * 15); // 15 min expiry
      await createPasswordResetToken(
        token, 
        user.id,
        expiresAt
      )

      //TODO: send token via email.
      console.log(`Reset link: http://localhost:3000/reset-password?token=${token}`);

      res.json({ 
        message: "Reset link sent to email (check console for now)" 
      });
    }catch(err){
      next(err);
    }
});


router.post("/reset-password", async (req, res,next ) => {
  const { token, newPassword } = req.body;

  const resetToken = await findPasswordResetToken(token);
  if (!resetToken) {
    return res.status(400).json({ error: "Invalid token" });
  }

  if (resetToken.expiresAt < new Date()) {
    return res.status(400).json({ error: "Token expired" });
  }

  // hash password
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  const user = await findUserById(resetToken.userId);
  const pwd = user?.password;
  const isSamePassword = await bcrypt.compare(
    newPassword, 
    pwd ? pwd : ""
  );
  if (isSamePassword){
    return res.status(400).json({ 
    error: "Must use a different password`" 
    });
  }

  await updateUsersPassword(
    resetToken.userId, hashedPassword
  );
  // remove token so it can’t be reused
  await deletePasswordResetToken(token);

  res.json({ message: "Password reset successfully" });
});

export = router;