import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { isAuthenticated, requireRole, notFound, errorHandler } from "../middlewares";

process.env.JWT_ACCESS_SECRET = "testsecret";

const generateToken = (payload: any) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: "5m" });

// ─────────────────────────────────────────────────────────────────────────────
// isAuthenticated
// ─────────────────────────────────────────────────────────────────────────────
describe("isAuthenticated middleware", () => {
  const validPayload = { userId: "user-123", role: "DRIVER" };

  const app = express();
  app.get("/protected", isAuthenticated, (req: any, res: Response) => {
    res.json({ payload: req.payload });
  });

  it("should reject request with no Authorization header (401)", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.text).toContain("Un-Authorized");
  });

  it("should allow access with a valid token and attach payload", async () => {
    const token = generateToken(validPayload);
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.payload.userId).toBe(validPayload.userId);
    expect(res.body.payload.role).toBe(validPayload.role);
  });

  it("should reject request with an invalid token (401)", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer invalid.token.here");

    expect(res.status).toBe(401);
    expect(res.text).toContain("Un-Authorized");
  });

  it("should reject request with expired token (401)", async () => {
    const actualExpired = jwt.sign(validPayload, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: "-1s",
    });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${actualExpired}`);

    expect(res.status).toBe(401);
    expect(res.text).toContain("TokenExpiredError");
  });

  it("should reject token signed with wrong secret (401)", async () => {
    const wrongToken = jwt.sign(validPayload, "wrong-secret", { expiresIn: "5m" });
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${wrongToken}`);

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireRole
// ─────────────────────────────────────────────────────────────────────────────
describe("requireRole middleware", () => {
  const buildApp = (...roles: Role[]) => {
    const a = express();
    // Simulate isAuthenticated having already run by injecting payload manually
    a.use((req: any, _res: Response, next: NextFunction) => {
      const auth = req.headers.authorization;
      if (auth) {
        const token = auth.split(" ")[1];
        req.payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;
      }
      next();
    });
    a.get("/guarded", requireRole(...roles), (_req: Request, res: Response) => {
      res.json({ ok: true });
    });
    return a;
  };

  it("should allow access when role matches", async () => {
    const app = buildApp(Role.ADMIN);
    const token = generateToken({ userId: "admin-1", role: Role.ADMIN });
    const res = await request(app)
      .get("/guarded")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("should deny access when role does not match (403)", async () => {
    const app = buildApp(Role.ADMIN);
    const token = generateToken({ userId: "user-1", role: Role.USER });
    const res = await request(app)
      .get("/guarded")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("should allow access when one of multiple roles matches", async () => {
    const app = buildApp(Role.ADMIN, Role.DRIVER);
    const token = generateToken({ userId: "driver-1", role: Role.DRIVER });
    const res = await request(app)
      .get("/guarded")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("should deny USER when only DRIVER and ADMIN are allowed (403)", async () => {
    const app = buildApp(Role.ADMIN, Role.DRIVER);
    const token = generateToken({ userId: "user-1", role: Role.USER });
    const res = await request(app)
      .get("/guarded")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("should deny request with no payload (missing role)", async () => {
    const app = buildApp(Role.ADMIN);
    // No Authorization header — payload won't be set
    const res = await request(app).get("/guarded");
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// notFound middleware
// ─────────────────────────────────────────────────────────────────────────────
describe("notFound middleware", () => {
  const app = express();
  app.use(notFound);
  app.use((err: any, req: any, res: any, next: any) => {
    res.status(res.statusCode).json({ message: err.message });
  });

  it("should return 404 with the original URL in the message", async () => {
    const res = await request(app).get("/some/unknown/path");
    expect(res.status).toBe(404);
    expect(res.body.message).toContain("/some/unknown/path");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// errorHandler middleware
// ─────────────────────────────────────────────────────────────────────────────
describe("errorHandler middleware", () => {
  const makeApp = (statusCode: number, errorMsg: string) => {
    const a = express();
    a.get("/boom", (req: Request, res: Response, next: NextFunction) => {
      if (statusCode !== 200) res.status(statusCode);
      next(new Error(errorMsg));
    });
    a.use(errorHandler as any);
    return a;
  };

  beforeAll(() => {
    process.env.NODE_ENV = "test";
  });

  it("should return 500 with message when status is 200 (fallback)", async () => {
    const app = makeApp(200, "Something broke");
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Something broke");
  });

  it("should return the explicit status code set before calling next()", async () => {
    const app = makeApp(422, "Unprocessable entity");
    const res = await request(app).get("/boom");
    expect(res.status).toBe(422);
    expect(res.body.message).toBe("Unprocessable entity");
  });

  it("should hide the stack trace in production", async () => {
    process.env.NODE_ENV = "production";
    const app = makeApp(500, "Internal error");
    const res = await request(app).get("/boom");
    expect(res.body.stack).toBe("🥞");
    process.env.NODE_ENV = "test";
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createUploader factory
// ─────────────────────────────────────────────────────────────────────────────
describe("createUploader", () => {
  // Import here to avoid circular issues in top-level import
  const { createUploader } = require("../middlewares");
  const path = require("path");
  const fs = require("fs");

  it("should return a multer middleware instance", () => {
    const uploader = createUploader("test-uploads-tmp");
    // multer middleware exposes .single, .array, .fields, etc.
    expect(typeof uploader.single).toBe("function");
    expect(typeof uploader.array).toBe("function");
  });

  it("should create the upload directory if it does not exist", () => {
    const subfolder = `test-uploads-${Date.now()}`;
    const expectedDir = path.join(process.cwd(), "uploads", subfolder);
    // Ensure the dir doesn't exist before
    if (fs.existsSync(expectedDir)) fs.rmdirSync(expectedDir, { recursive: true });

    createUploader(subfolder);

    expect(fs.existsSync(expectedDir)).toBe(true);
    // Cleanup
    fs.rmdirSync(expectedDir, { recursive: true });
  });
});
