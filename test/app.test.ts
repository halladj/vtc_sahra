import request from "supertest";
import app from "../src/app";

describe("app", () => {
  it("responds with a not found message", async () => {
    const res = await request(app)
      .get("/what-is-this-even")
      .set("Accept", "application/json");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
  });
});

describe("GET /", () => {
  it("responds with a json message", async () => {
    const res = await request(app)
      .get("/")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({
      message: "🦄🌈✨👋🌎🌍🌏✨🌈🦄",
    });
  });
});
