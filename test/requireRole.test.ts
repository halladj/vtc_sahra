import request from "supertest";
import express from "express";
import { requireRole } from "../src/middlewares";
import { Role } from "../src/generated/prisma";

const app = express();

// Fake route using the middleware
app.get(
  "/admin-only",
  (req: any, res, next) => {
    // mock authentication middleware
    req.user = { id: "123", role: Role.ADMIN };
    next();
  },
  requireRole(Role.ADMIN),
  (req, res) => {
    res.json({ message: "Welcome Admin!" });
  }
);

app.get(
  "/driver-only",
  (req: any, res, next) => {
    req.user = { id: "456", role: Role.USER };
    next();
  },
  requireRole(Role.DRIVER),
  (req, res) => {
    res.json({ message: "Welcome Driver!" });
  }
);

describe("requireRole middleware", () => {
  it("should allow access when user has the required role", async () => {
    const res = await request(app).get("/admin-only");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Welcome Admin!" });
  });

  it("should forbid access when user does not have the required role", async () => {
    const res = await request(app).get("/driver-only");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden" });
  });
});
