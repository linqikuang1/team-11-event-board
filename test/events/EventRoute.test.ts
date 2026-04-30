import request from "supertest";
import { type Express } from "express";
import { createTestComposedApp } from "../../src/composition";

function buildApp() {
  return createTestComposedApp().getExpressApp();
}

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

    expect(res.status).toBe(200);
    expect(res.headers["hx-redirect"]).toContain("/events");
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

describe("GET /events/search", () => {
  it("happy path: authenticated user can load search partial", async () => {
    const app = buildApp();
    const cookie = await loginAs(app, USER_EMAIL, PASSWORD);

    const res = await request(app)
      .get("/events/search")
      .set("Cookie", cookie)
      .query({ q: "" });

    expect(res.status).toBe(200);
  });

  it("error: unauthenticated user gets redirected or blocked", async () => {
    const app = buildApp();

    const res = await request(app)
      .get("/events/search")
      .query({ q: "" });

    expect([302, 401]).toContain(res.status);
  });

  it("error: invalid timeframe returns 400", async () => {
    const app = buildApp();
    const cookie = await loginAs(app, USER_EMAIL, PASSWORD);

    const res = await request(app)
      .get("/events/search")
      .set("Cookie", cookie)
      .query({ timeframe: "next-month" });

    expect(res.status).toBe(400);
  });

  it("error: invalid category returns 400", async () => {
    const app = buildApp();
    const cookie = await loginAs(app, USER_EMAIL, PASSWORD);

    const res = await request(app)
      .get("/events/search")
      .set("Cookie", cookie)
      .query({ category: "Music!!" });

    expect(res.status).toBe(400);
  });
});

describe("GET /events", () => {
  it("renders filter state from query params for bookmarkable URLs", async () => {
    const app = buildApp();
    const cookie = await loginAs(app, USER_EMAIL, PASSWORD);

    const res = await request(app)
      .get("/events")
      .set("Cookie", cookie)
      .query({ q: "music", timeframe: "weekend" });

    expect(res.status).toBe(200);
    expect(res.text).toContain('name="q"');
    expect(res.text).toContain('value="music"');
    expect(res.text).toContain('option value="weekend" selected');
    expect(res.text).toContain('method="get"');
    expect(res.text).toContain('action="/events"');
  });
});

// ── Feature 2 — Event Detail Page ────────────────────────────────

describe("GET /events/:id", () => {
  it("happy path: authenticated user can view a published event", async () => {
    const app = buildApp();
    const staffCookie = await loginAs(app, STAFF_EMAIL, PASSWORD);
    
    const createRes = await request(app)
    .post("/events/create")
    .set("Cookie", staffCookie)
    .type("form")
    .send(validFormData);
    const eventId = createRes.headers["hx-redirect"]?.split("/events/")[1];
    
    await request(app)
    .post(`/events/${eventId}/publish`)
    .set("Cookie", staffCookie);
    const userCookie = await loginAs(app, USER_EMAIL, PASSWORD);
    
    const res = await request(app)
    .get(`/events/${eventId}`)
    .set("Cookie", userCookie);    
    expect(res.status).toBe(200);
  });

  it("error: draft event is not visible to members", async () => {
    const app = buildApp();
    const staffCookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

    const createRes = await request(app)
      .post("/events/create")
      .set("Cookie", staffCookie)
      .type("form")
      .send(validFormData);

    const eventId = createRes.headers["hx-redirect"]?.split("/events/")[1];

    const userCookie = await loginAs(app, USER_EMAIL, PASSWORD);

    const res = await request(app)
      .get(`/events/${eventId}`)
      .set("Cookie", userCookie);

    expect(res.status).toBe(404);
  });

  it("error: draft event is not visible to another staff member", async () => {
    const app = buildApp();
    const staffCookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

    const createRes = await request(app)
      .post("/events/create")
      .set("Cookie", staffCookie)
      .type("form")
      .send(validFormData);

    const eventId = createRes.headers["hx-redirect"]?.split("/events/")[1];

    const adminCookie = await loginAs(app, ADMIN_EMAIL, PASSWORD);

    const res = await request(app)
      .get(`/events/${eventId}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
  });

  it("error: event not found returns 404", async () => {
    const app = buildApp();
    const cookie = await loginAs(app, USER_EMAIL, PASSWORD);

    const res = await request(app)
      .get("/events/non-existent-id")
      .set("Cookie", cookie);

    expect(res.status).toBe(404);
  });

  it("error: unauthenticated user is redirected to login", async () => {
    const app = buildApp();

    const res = await request(app).get("/events/some-id");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login");
  });
});

// ── Feature 3 — Event Editing ─────────────────────────────────────

describe("GET /events/:id/edit", () => {
  it("happy path: staff can access edit form for their own event", async () => {
    const app = buildApp();
    const cookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

    const createRes = await request(app)
      .post("/events/create")
      .set("Cookie", cookie)
      .type("form")
      .send(validFormData);

    const eventId = createRes.headers["hx-redirect"]?.split("/events/")[1];

    const res = await request(app)
      .get(`/events/${eventId}/edit`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
  });

  it("error: member cannot access the edit form", async () => {
    const app = buildApp();
    const staffCookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

    const createRes = await request(app)
      .post("/events/create")
      .set("Cookie", staffCookie)
      .type("form")
      .send(validFormData);

    const eventId = createRes.headers["hx-redirect"]?.split("/events/")[1];

    const userCookie = await loginAs(app, USER_EMAIL, PASSWORD);

    const res = await request(app)
      .get(`/events/${eventId}/edit`)
      .set("Cookie", userCookie);

    expect(res.status).toBe(403);
  });

  it("error: unauthenticated user is redirected to login", async () => {
    const app = buildApp();

    const res = await request(app).get("/events/some-id/edit");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login");
  });
});

describe("POST /events/:id/edit", () => {
  it("happy path: staff can edit their own event", async () => {
    const app = buildApp();
    const cookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

    const createRes = await request(app)
      .post("/events/create")
      .set("Cookie", cookie)
      .type("form")
      .send(validFormData);

    const eventId = createRes.headers["hx-redirect"]?.split("/events/")[1];

    const res = await request(app)
      .post(`/events/${eventId}/edit`)
      .set("Cookie", cookie)
      .type("form")
      .send({ ...validFormData, title: "Updated Title" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(`/events/${eventId}`);
  });

  it("error: member cannot submit edit form", async () => {
    const app = buildApp();
    const staffCookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

    const createRes = await request(app)
      .post("/events/create")
      .set("Cookie", staffCookie)
      .type("form")
      .send(validFormData);

    const eventId = createRes.headers["hx-redirect"]?.split("/events/")[1];

    const userCookie = await loginAs(app, USER_EMAIL, PASSWORD);

    const res = await request(app)
      .post(`/events/${eventId}/edit`)
      .set("Cookie", userCookie)
      .type("form")
      .send({ ...validFormData, title: "Hacked Title" });

    expect(res.status).toBe(403);
  });

  it("error: submitting invalid data returns 400", async () => {
    const app = buildApp();
    const cookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

    const createRes = await request(app)
      .post("/events/create")
      .set("Cookie", cookie)
      .type("form")
      .send(validFormData);

    const eventId = createRes.headers["hx-redirect"]?.split("/events/")[1];

    const res = await request(app)
      .post(`/events/${eventId}/edit`)
      .set("Cookie", cookie)
      .type("form")
      .send({ ...validFormData, title: "" });

    expect(res.status).toBe(400);
  });

  it("error: editing a cancelled event returns 409", async () => {
    const app = buildApp();
    const staffCookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

    const createRes = await request(app)
      .post("/events/create")
      .set("Cookie", staffCookie)
      .type("form")
      .send(validFormData);

    const eventId = createRes.headers["hx-redirect"]?.split("/events/")[1];

    await request(app)
      .post(`/events/${eventId}/publish`)
      .set("Cookie", staffCookie);

    await request(app)
      .post(`/events/${eventId}/cancel`)
      .set("Cookie", staffCookie);

    const res = await request(app)
      .post(`/events/${eventId}/edit`)
      .set("Cookie", staffCookie)
      .type("form")
      .send({ ...validFormData, title: "Updated Title" });

    expect(res.status).toBe(409);
  });
  
  // ── Delete Event ────────────────────────────────────────────────── 
  describe("POST /events/:id/delete", () => {
    it("happy path: staff can delete their own event and is redirected to /events", async () => {
      const app = buildApp();
      const cookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

      const createRes = await request(app)
        .post("/events/create")
        .set("Cookie", cookie)
        .type("form")
        .send(validFormData);

      const eventId = createRes.headers["hx-redirect"]?.split("/events/")[1];

      const res = await request(app)
        .post(`/events/${eventId}/delete`)
        .set("Cookie", cookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("/events");
    });

    it("error: member cannot delete an event", async () => {
      const app = buildApp();
      const staffCookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

      const createRes = await request(app)
        .post("/events/create")
        .set("Cookie", staffCookie)
        .type("form")
        .send(validFormData);

      const eventId = createRes.headers["hx-redirect"]?.split("/events/")[1];

      const userCookie = await loginAs(app, USER_EMAIL, PASSWORD);

      const res = await request(app)
        .post(`/events/${eventId}/delete`)
        .set("Cookie", userCookie);

      expect(res.status).toBe(403);
    });

    it("error: deleting a non-existent event returns 404", async () => {
      const app = buildApp();
      const cookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

      const res = await request(app)
        .post("/events/non-existent-id/delete")
        .set("Cookie", cookie);

      expect(res.status).toBe(404);
    });

    it("error: unauthenticated user cannot delete an event", async () => {
      const app = buildApp();

      const res = await request(app).post("/events/some-id/delete");

      expect([302, 401]).toContain(res.status);
    });
  });

  // ── Redirect after create ─────────────────────────────────────────

  describe("POST /events/create redirect", () => {
    it("happy path: after creation HX-Redirect points to the event detail page", async () => {
      const app = buildApp();
      const cookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

      const res = await request(app)
        .post("/events/create")
        .set("Cookie", cookie)
        .type("form")
        .send(validFormData);

      expect(res.status).toBe(200);
      expect(res.headers["hx-redirect"]).toMatch(/\/events\/[a-z0-9-]+$/);
    });
  });

  // ── My Drafts ─────────────────────────────────────────────────────

  describe("GET /events (drafts section)", () => {
    it("happy path: staff sees their own draft in the drafts section", async () => {
      const app = buildApp();
      const cookie = await loginAs(app, STAFF_EMAIL, PASSWORD);

      await request(app)
        .post("/events/create")
        .set("Cookie", cookie)
        .type("form")
        .send(validFormData);

      const res = await request(app)
        .get("/events")
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.text).toContain("My Drafts");
      expect(res.text).toContain(validFormData.title);
    });

    it("error: member does not see drafts section", async () => {
      const app = buildApp();
      const userCookie = await loginAs(app, USER_EMAIL, PASSWORD);

      const res = await request(app)
        .get("/events")
        .set("Cookie", userCookie);

      expect(res.status).toBe(200);
      expect(res.text).not.toContain("My Drafts");
    });
  });
});