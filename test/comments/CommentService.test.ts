import { CreateCommentService } from "../../src/comments/CommentService";
import { CreateInMemoryCommentRepository } from "../../src/comments/InMemoryCommentRepository";
import { CreateInMemoryEventRepository } from "../../src/events/InMemoryEventRepository";
import type { IEventRepository } from "../../src/events/EventRepository";
import type { ICommentRepository } from "../../src/comments/CommentRepository";
import type { IEventRecord } from "../../src/events/Event";
import type { SessionContext } from "../../src/events/EventService";

function publishedEvent(overrides: Partial<IEventRecord> = {}): IEventRecord {
  return {
    id: "event-1",
    title: "Test Event",
    description: "A test event",
    location: "Room 101",
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: new Date(Date.now() + 90000000).toISOString(),
    status: "published",
    organizerId: "organizer-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    capacity: null,
    tags: [],
    ...overrides,
  };
}

function userCtx(overrides: Partial<SessionContext> = {}): SessionContext {
  return { userId: "user-1", role: "user", ...overrides };
}

function setup() {
  const eventRepo = CreateInMemoryEventRepository();
  const commentRepo = CreateInMemoryCommentRepository();
  const service = CreateCommentService(commentRepo, eventRepo);
  return { eventRepo, commentRepo, service };
}

async function seedEvent(eventRepo: IEventRepository, event?: IEventRecord) {
  await eventRepo.save(event ?? publishedEvent());
}

describe("CommentService", () => {
  describe("addComment", () => {
    it("adds a comment to a published event", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo);

      const result = await service.addComment(userCtx(), {
        eventId: "event-1",
        content: "Great event!",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe("Great event!");
        expect(result.value.eventId).toBe("event-1");
        expect(result.value.userId).toBe("user-1");
      }
    });

    it("rejects empty content", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo);

      const result = await service.addComment(userCtx(), {
        eventId: "event-1",
        content: "   ",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("ValidationError");
      }
    });

    it("rejects content exceeding 500 characters", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo);

      const result = await service.addComment(userCtx(), {
        eventId: "event-1",
        content: "x".repeat(501),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("ValidationError");
      }
    });

    it("rejects comment on a non-existent event", async () => {
      const { service } = setup();

      const result = await service.addComment(userCtx(), {
        eventId: "no-such-event",
        content: "Hello",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("EventNotFound");
      }
    });

    it("rejects comment on a draft event", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo, publishedEvent({ status: "draft" }));

      const result = await service.addComment(userCtx(), {
        eventId: "event-1",
        content: "Hello",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("EventNotPublished");
      }
    });

    it("rejects comment on a cancelled event", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo, publishedEvent({ status: "cancelled" }));

      const result = await service.addComment(userCtx(), {
        eventId: "event-1",
        content: "Hello",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("EventNotPublished");
      }
    });
  });

  describe("deleteComment", () => {
    it("allows the author to delete their own comment", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo);

      const addResult = await service.addComment(userCtx(), {
        eventId: "event-1",
        content: "My comment",
      });
      expect(addResult.ok).toBe(true);
      if (!addResult.ok) return;

      const deleteResult = await service.deleteComment(
        userCtx(),
        addResult.value.id,
        "event-1",
      );

      expect(deleteResult.ok).toBe(true);
    });

    it("allows an admin to delete any comment", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo);

      const addResult = await service.addComment(userCtx(), {
        eventId: "event-1",
        content: "User comment",
      });
      expect(addResult.ok).toBe(true);
      if (!addResult.ok) return;

      const deleteResult = await service.deleteComment(
        userCtx({ userId: "admin-1", role: "admin" }),
        addResult.value.id,
        "event-1",
      );

      expect(deleteResult.ok).toBe(true);
    });

    it("allows the event organizer to delete a comment", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo);

      const addResult = await service.addComment(userCtx(), {
        eventId: "event-1",
        content: "User comment",
      });
      expect(addResult.ok).toBe(true);
      if (!addResult.ok) return;

      const deleteResult = await service.deleteComment(
        userCtx({ userId: "organizer-1", role: "staff" }),
        addResult.value.id,
        "event-1",
      );

      expect(deleteResult.ok).toBe(true);
    });

    it("rejects deletion by a non-author, non-admin, non-organizer", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo);

      const addResult = await service.addComment(userCtx(), {
        eventId: "event-1",
        content: "My comment",
      });
      expect(addResult.ok).toBe(true);
      if (!addResult.ok) return;

      const deleteResult = await service.deleteComment(
        userCtx({ userId: "stranger-1" }),
        addResult.value.id,
        "event-1",
      );

      expect(deleteResult.ok).toBe(false);
      if (!deleteResult.ok) {
        expect(deleteResult.value.name).toBe("Forbidden");
      }
    });

    it("returns CommentNotFound for a non-existent comment", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo);

      const result = await service.deleteComment(userCtx(), "no-such-id", "event-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("CommentNotFound");
      }
    });
  });

  describe("listComments", () => {
    it("returns comments for a valid event", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo);

      await service.addComment(userCtx(), { eventId: "event-1", content: "First" });
      await service.addComment(userCtx({ userId: "user-2" }), { eventId: "event-1", content: "Second" });

      const result = await service.listComments(userCtx(), "event-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
    });

    it("returns empty array when no comments exist", async () => {
      const { eventRepo, service } = setup();
      await seedEvent(eventRepo);

      const result = await service.listComments(userCtx(), "event-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it("returns EventNotFound for a non-existent event", async () => {
      const { service } = setup();

      const result = await service.listComments(userCtx(), "no-such-event");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("EventNotFound");
      }
    });
  });
});
