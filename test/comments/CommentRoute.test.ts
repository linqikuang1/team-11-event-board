import express, { type Express, type Request, type Response } from "express";
import session from "express-session";
import request from "supertest";
import { CreateCommentController } from "../../src/comments/CommentController";
import { CreateCommentService } from "../../src/comments/CommentService";
import { CreateInMemoryCommentRepository } from "../../src/comments/InMemoryCommentRepository";
import { CreateInMemoryEventRepository } from "../../src/events/InMemoryEventRepository";
import { touchAppSession, type AppSessionStore } from "../../src/session/AppSession";
import type { IEventRecord } from "../../src/events/Event";

function buildApp() {
  const eventRepository = CreateInMemoryEventRepository();
  const commentRepository = CreateInMemoryCommentRepository();
  const commentService = CreateCommentService(commentRepository, eventRepository);
  const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const commentController = CreateCommentController(commentService, logger);

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

  app.post("/events/:id/comments", async (req, res) => {
    const eventId = typeof req.params.id === "string" ? req.params.id : "";
    const content = typeof req.body.content === "string" ? req.body.content : "";
    await commentController.postComment(
      res,
      eventId,
      content,
      touchAppSession(req.session as AppSessionStore),
      req.get("HX-Request") === "true",
    );
  });

  app.post("/events/:id/comments/:commentId/delete", async (req, res) => {
    const eventId = typeof req.params.id === "string" ? req.params.id : "";
    const commentId = typeof req.params.commentId === "string" ? req.params.commentId : "";
    await commentController.deleteComment(
      res,
      eventId,
      commentId,
      touchAppSession(req.session as AppSessionStore),
      req.get("HX-Request") === "true",
    );
  });

  return { app, eventRepository, commentService };
}

function futurePublishedEvent(overrides: Partial<IEventRecord> = {}): IEventRecord {
  const now = Date.now();
  return {
    id: "event-1",
    title: "Feature Test Event",
    description: "Test event",
    location: "Room A",
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

describe("Comment routes (SuperTest)", () => {
  it("happy path: authenticated user posts comment via HTMX and gets HTML fragment response", async () => {
    const { app, eventRepository } = buildApp();
    await eventRepository.save(futurePublishedEvent());

    const res = await request(app)
      .post("/events/event-1/comments")
      .set("x-test-user-id", "user-1")
      .set("x-test-user-role", "user")
      .set("HX-Request", "true")
      .type("form")
      .send({ content: "Looks great!" });

    expect(res.status).toBe(200);
    expect(res.body.view).toBe("comments/partials/comment-list");
    expect(JSON.stringify(res.body.locals.comments)).toContain("Looks great!");
  });

  it("domain error: invalid input returns 400 with error fragment", async () => {
    const { app, eventRepository } = buildApp();
    await eventRepository.save(futurePublishedEvent());

    const res = await request(app)
      .post("/events/event-1/comments")
      .set("x-test-user-id", "user-1")
      .set("x-test-user-role", "user")
      .set("HX-Request", "true")
      .type("form")
      .send({ content: "   " });

    expect(res.status).toBe(400);
    expect(res.body.view).toBe("partials/error");
    expect(res.body.locals.message).toContain("Invalid comment input");
  });

  it("domain error: unauthenticated request returns 401", async () => {
    const { app, eventRepository } = buildApp();
    await eventRepository.save(futurePublishedEvent());

    const res = await request(app)
      .post("/events/event-1/comments")
      .set("HX-Request", "true")
      .type("form")
      .send({ content: "Hello" });

    expect(res.status).toBe(401);
    expect(res.body.view).toBe("partials/error");
  });

  it("edge case: non-author/non-admin deletion returns 403", async () => {
    const { app, eventRepository, commentService } = buildApp();
    await eventRepository.save(futurePublishedEvent());
    const created = await commentService.addComment(
      { userId: "author-1", role: "user" },
      { eventId: "event-1", content: "Author comment" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const res = await request(app)
      .post(`/events/event-1/comments/${created.value.id}/delete`)
      .set("x-test-user-id", "other-user")
      .set("x-test-user-role", "user")
      .set("HX-Request", "true");

    expect(res.status).toBe(403);
    expect(res.body.view).toBe("partials/error");
  });
});
