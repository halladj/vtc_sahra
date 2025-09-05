import request from "supertest";
import app from "../src/app";

describe("GET /api/v1", () => {
  it("responds with a json message", async () => {
    const res = await request(app)
      .get("/api/v1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({
      message: "API - 👋🌎🌍🌏",
    });
  });
});

// describe("GET /api/v1/emojis", () => {
//   it("responds with a json message", async () => {
//     const res = await request(app)
//       .get("/api/v1/emojis")
//       .set("Accept", "application/json");

//     expect(res.status).toBe(200);
//     expect(res.headers["content-type"]).toMatch(/json/);
//     expect(res.body).toEqual(["😀", "😳", "🙄"]);
//   });
// });
