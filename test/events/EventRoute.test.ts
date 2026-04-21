import request from "supertest";
import { type Express } from "express";
import { createComposedApp } from "../../src/composition";

function buildApp() {
  return createComposedApp().getExpressApp();
}

// Helper to log in and get a session cookie
async function loginAs(
  app: Express,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app)
    .post("/login")
    .type("form")
    .send({ email, password });
  const cookies = res.headers["set-cookie"];
  return Array.isArray(cookies) ? cookies[0] : cookies;
}

const STAFF_EMAIL = "staff@app.test";
const ADMIN_EMAIL = "admin@app.test";
const USER_EMAIL = "user@app.test";
const PASSWORD = "password123";

const validFormData = {
  title: "Test Event",
  description: "A test event",
  location: "Room 101",
  startTime: "2099-01-01T10:00",
  endTime: "2099-01-01T12:00",
  capacity: "",
  tags: "",
};

// ── Feature 1 — Event Creation Routes ────────────────────────────

describe("POST /events/create", () => {
  it("happy path: staff can create an event and is redirected to /events", async () => {
    const app = buildApp();
    const cookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

    const res = await request(app)
      .post("/events/create")
      .set("Cookie", cookie)
      .type("form")
      .send(validFormData);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/events");
  });

  it("error: member cannot access the create form", async () => {
    const app = buildApp();
    const cookie = await loginAs(app, USER_EMAIL, PASSWORD);

    const res = await request(app)
      .get("/events/create")
      .set("Cookie", cookie);

    expect(res.status).toBe(403);
  });

  it("error: unauthenticated user is redirected to login", async () => {
    const app = buildApp();

    const res = await request(app).get("/events/create");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login");
  });

  it("error: submitting invalid data returns 400", async () => {
    const app = buildApp();
    const cookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

    const res = await request(app)
      .post("/events/create")
      .set("Cookie", cookie)
      .type("form")
      .send({ ...validFormData, title: "" });

    expect(res.status).toBe(400);
  });
});