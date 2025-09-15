import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Role } from "../generated/prisma";
import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';




interface AuthenticatedRequest extends Request {
  payload?: JwtPayload;
}

export function notFound(req:Request, res:Response, next:NextFunction) {
  res.status(404);
  const error = new Error(`🔍 - Not Found - ${req.originalUrl}`);
  next(error);
}

/* eslint-disable no-unused-vars */
export function errorHandler(err:Error, req:Request, res:Response, next:NextFunction) {
  /* eslint-enable no-unused-vars */
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack,
  });
}

export function isAuthenticated(req:AuthenticatedRequest, res:Response, next:NextFunction) {
  const { authorization } = req.headers;

  if (!authorization) {
    res.status(401);
    throw new Error('🚫 Un-Authorized 🚫');
  }

  try {
    const token = authorization.split(' ')[1]!;
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!)as JwtPayload;
    req.payload = payload;
  } catch (err:any) {
    res.status(401);
    if (err.name === 'TokenExpiredError') {
      throw new Error(err.name);
    }
    throw new Error('🚫 Un-Authorized 🚫');
  }

  return next();
}

export function requireRole(...allowedRoles: Role[]) {
  return (req: any, res:Response, next:NextFunction) => {
    const userRole = req.user.role;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}



// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, path.join(__dirname, '../../uploads/users')); // go 2 levels up
//   },
//   filename: (req, file, cb) => {
//     const uniqueName = `${uuid()}${path.extname(file.originalname)}`;
//     cb(null, uniqueName);
//   },
// });


// export const upload = multer({ storage });

export function createUploader(subfolder: string) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, `../../uploads/${subfolder}`));
    },
    filename: (req, file, cb) => {
      const uniqueName = `${uuid()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

  return multer({ storage });
}
