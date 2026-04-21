import express, { type Request, type Response } from "express";
import session from "express-session";
import request from "supertest";
import type { IEventRecord } from "../../src/events/Event";
import { CreateInMemoryEventRepository } from "../../src/events/InMemoryEventRepository";
import { CreateInMemorySavedEventRepository } from "../../src/saved/InMemorySavedEventRepository";
import { CreateSavedEventController } from "../../src/saved/SavedEventController";
import { CreateSavedEventService } from "../../src/saved/SavedEventService";
import { touchAppSession, type AppSessionStore } from "../../src/session/AppSession";

function buildApp() {
  const events = CreateInMemoryEventRepository();
  const saved = CreateInMemorySavedEventRepository();
  const service = CreateSavedEventService(saved, events);
  const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const controller = CreateSavedEventController(service, logger);

  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      name: "app.sid",
      secret: "test-secret",
      resave: false,
      saveUninitialized: true,
    }),
  );

  app.use((req: Request, _res: Response, next) => {
    const store = req.session as AppSessionStore;
    touchAppSession(store);
    const userId = req.get("x-test-user-id");
    const role = req.get("x-test-user-role");
    if (store.app) {
      if (userId && (role === "user" || role === "staff" || role === "admin")) {
        store.app.authenticatedUser = {
          userId,
          email: `${userId}@app.test`,
          displayName: userId,
          role,
          signedInAt: new Date().toISOString(),
        };
      } else {
        store.app.authenticatedUser = null;
      }
    }
    next();
  });

  app.use((_req, res, next) => {
    res.render = ((view: string, locals?: Record<string, unknown>) => {
      res.type("application/json");
      return res.send({ view, locals });
    }) as Response["render"];
    next();
  });

  app.get("/saved", async (req, res) => {
    await controller.showSavedEvents(res, touchAppSession(req.session as AppSessionStore));
  });

  app.post("/events/:id/save", async (req, res) => {
    const eventId = typeof req.params.id === "string" ? req.params.id : "";
    await controller.toggleSave(res, eventId, touchAppSession(req.session as AppSessionStore));
  });

  return { app, events };
}

function publishedEvent(overrides: Partial<IEventRecord> = {}): IEventRecord {
  const now = Date.now();
  return {
    id: "event-1",
    title: "Feature 14 Event",
    description: "Save for later test event",
    location: "Room B",
    startTime: new Date(now + 86400000).toISOString(),
    endTime: new Date(now + 90000000).toISOString(),
    status: "published",
    organizerId: "staff-1",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    capacity: null,
    tags: [],
    ...overrides,
  };
}

describe("Saved routes (SuperTest)", () => {
  it("happy path: member can toggle save and is redirected to /saved", async () => {
    const { app, events } = buildApp();
    await events.save(publishedEvent());

    const res = await request(app)
      .post("/events/event-1/save")
      .set("x-test-user-id", "user-1")
      .set("x-test-user-role", "user");

    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/saved");
  });

  it("domain error: member toggling missing event gets 404", async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post("/events/no-such-event/save")
      .set("x-test-user-id", "user-1")
      .set("x-test-user-role", "user");

    expect(res.status).toBe(404);
    expect(res.body.view).toBe("partials/error");
  });

  it("domain error: non-member role cannot save events", async () => {
    const { app, events } = buildApp();
    await events.save(publishedEvent());

    const staffRes = await request(app)
      .post("/events/event-1/save")
      .set("x-test-user-id", "staff-1")
      .set("x-test-user-role", "staff");
    const adminRes = await request(app)
      .post("/events/event-1/save")
      .set("x-test-user-id", "admin-1")
      .set("x-test-user-role", "admin");

    expect(staffRes.status).toBe(403);
    expect(adminRes.status).toBe(403);
    expect(staffRes.body.view).toBe("partials/error");
    expect(adminRes.body.view).toBe("partials/error");
  });

  it("happy path: member can view saved list page", async () => {
    const { app, events } = buildApp();
    await events.save(publishedEvent());
    await request(app)
      .post("/events/event-1/save")
      .set("x-test-user-id", "user-1")
      .set("x-test-user-role", "user");

    const res = await request(app)
      .get("/saved")
      .set("x-test-user-id", "user-1")
      .set("x-test-user-role", "user");

    expect(res.status).toBe(200);
    expect(res.body.view).toBe("saved/list");
  });

  it("domain error: unauthenticated and non-member saved-list access are blocked", async () => {
    const { app } = buildApp();

    const unauthenticated = await request(app).get("/saved");
    const staff = await request(app)
      .get("/saved")
      .set("x-test-user-id", "staff-1")
      .set("x-test-user-role", "staff");

    expect(unauthenticated.status).toBe(401);
    expect(staff.status).toBe(403);
    expect(unauthenticated.body.view).toBe("partials/error");
    expect(staff.body.view).toBe("partials/error");
  });
});
