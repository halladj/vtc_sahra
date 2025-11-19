import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { isAuthenticated } from "../middlewares";

// Mock secret
process.env.JWT_ACCESS_SECRET = "testsecret";

const app = express();

// Protected test route
app.get("/protected", isAuthenticated, (req: any, res: Response) => {
  res.json({ payload: req.payload });
});

describe("isAuthenticated middleware", () => {
  const validPayload = { userId: "user-123", role: "DRIVER" };

  it("should reject request with no Authorization header", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.text).toContain("Un-Authorized");
  });

  it("should allow access with a valid token and attach payload", async () => {
    const token = jwt.sign(validPayload, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: "5m",
    });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.payload.userId).toBe(validPayload.userId);
    expect(res.body.payload.role).toBe(validPayload.role);
  });

  it("should reject request with an invalid token", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer invalid.token.here");

    expect(res.status).toBe(401);
    expect(res.text).toContain("Un-Authorized");
  });

  it("should reject request with expired token", async () => {
    const expiredToken = jwt.sign(validPayload, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: "-1s", // already expired
    });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.text).toContain("TokenExpiredError");
  });
});
