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

  app.post("/events/:id/save", async (req, res) => {
    const eventId = typeof req.params.id === "string" ? req.params.id : "";
    await controller.toggleSave(
      res,
      eventId,
      touchAppSession(req.session as AppSessionStore),
      req.get("HX-Request") === "true",
    );
  });

  return { app, events };
}

function publishedEvent(overrides: Partial<IEventRecord> = {}): IEventRecord {
  const now = Date.now();
  return {
    id: "event-1",
    title: "HTMX Save Event",
    description: "HTMX test event",
    location: "Room C",
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

describe("Saved HTMX toggle route", () => {
  it("returns save-toggle fragment for HTMX requests", async () => {
    const { app, events } = buildApp();
    await events.save(publishedEvent());

    const res = await request(app)
      .post("/events/event-1/save")
      .set("x-test-user-id", "user-1")
      .set("x-test-user-role", "user")
      .set("HX-Request", "true");

    expect(res.status).toBe(200);
    expect(res.body.view).toBe("saved/partials/save-toggle");
    expect(res.body.locals.isSaved).toBe(true);
  });

  it("toggles fragment state on repeated HTMX clicks", async () => {
    const { app, events } = buildApp();
    await events.save(publishedEvent());

    const first = await request(app)
      .post("/events/event-1/save")
      .set("x-test-user-id", "user-1")
      .set("x-test-user-role", "user")
      .set("HX-Request", "true");
    const second = await request(app)
      .post("/events/event-1/save")
      .set("x-test-user-id", "user-1")
      .set("x-test-user-role", "user")
      .set("HX-Request", "true");

    expect(first.body.locals.isSaved).toBe(true);
    expect(second.body.locals.isSaved).toBe(false);
  });

  it("returns error fragment for invalid HTMX save attempt", async () => {
    const { app, events } = buildApp();
    await events.save(publishedEvent({ id: "cancelled-event", status: "cancelled" }));

    const res = await request(app)
      .post("/events/cancelled-event/save")
      .set("x-test-user-id", "user-1")
      .set("x-test-user-role", "user")
      .set("HX-Request", "true");

    expect(res.status).toBe(400);
    expect(res.body.view).toBe("partials/error");
  });
});
