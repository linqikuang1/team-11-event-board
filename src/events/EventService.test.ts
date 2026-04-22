import { CreateEventService } from "../../src/events/EventService";
import { CreateInMemoryEventRepository } from "../../src/events/InMemoryEventRepository";
import { CreateInMemoryRsvpRepository } from "../../src/events/InMemoryRsvpRepository";
import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";

const adminCtx = { userId: "user-admin", role: "admin" as const };
const staffCtx = { userId: "user-staff", role: "staff" as const };
const staffCtx2 = { userId: "user-staff-2", role: "staff" as const };
const userCtx = { userId: "user-member", role: "user" as const };

const validInput = {
  title: "Test Event",
  description: "A test event",
  location: "Room 101",
  startTime: "2099-01-01T10:00",
  endTime: "2099-01-01T12:00",
  capacity: null,
  tags: [],
};

function createService() {
  return CreateEventService(
    CreateInMemoryEventRepository(),
    CreateInMemoryRsvpRepository(),
    CreateInMemoryUserRepository(),
  );
}



// ── Feature 1 — Event Creation ────────────────────────────────────

describe("EventService.createEvent", () => {
  it("happy path: staff can create a draft event", async () => {
    const service = createService();
    const result = await service.createEvent(staffCtx, validInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("Test Event");
      expect(result.value.status).toBe("draft");
      expect(result.value.organizerId).toBe("user-staff");
    }
  });

  it("happy path: admin can create a draft event", async () => {
    const service = createService();
    const result = await service.createEvent(adminCtx, validInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("draft");
      expect(result.value.organizerId).toBe("user-admin");
    }
  });

  it("error: member cannot create an event", async () => {
    const service = createService();
    const result = await service.createEvent(userCtx, validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("Forbidden");
    }
  });

  it("error: title is required", async () => {
    const service = createService();
    const result = await service.createEvent(staffCtx, { ...validInput, title: "" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("ValidationError");
      if (result.value.name === "ValidationError") {
        expect(result.value.fields?.title).toBeDefined();
      }
    }
  });

  it("error: location is required", async () => {
    const service = createService();
    const result = await service.createEvent(staffCtx, { ...validInput, location: "" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("ValidationError");
      if (result.value.name === "ValidationError") {
        expect(result.value.fields?.location).toBeDefined();
      }
    }
  });

  it("error: endTime must be after startTime", async () => {
    const service = createService();
    const result = await service.createEvent(staffCtx, {
      ...validInput,
      startTime: "2099-01-01T12:00",
      endTime: "2099-01-01T10:00",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("ValidationError");
      if (result.value.name === "ValidationError") {
        expect(result.value.fields?.endTime).toBeDefined();
      }
    }
  });

  it("error: startTime must be in the future", async () => {
    const service = createService();
    const result = await service.createEvent(staffCtx, {
      ...validInput,
      startTime: "2000-01-01T10:00",
      endTime: "2000-01-01T12:00",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("ValidationError");
      if (result.value.name === "ValidationError") {
        expect(result.value.fields?.startTime).toBeDefined();
      }
    }
  });

  it("error: capacity must be a positive integer", async () => {
    const service = createService();
    const result = await service.createEvent(staffCtx, { ...validInput, capacity: -5 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("ValidationError");
    }
  });

  it("sets organizerId from session, not from input", async () => {
    const service = createService();
    const result = await service.createEvent(staffCtx, validInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.organizerId).toBe(staffCtx.userId);
    }
  });
});

// ── Feature 4 — RSVP Testing ──────────────────────────────────── (thank you for the formatting feature 1)
describe("EventService.toggleRsvp", () => {
  async function seedPublishedEvent(capacity: number | null = null) {
    const service = createService();
    const draft = await service.createEvent(staffCtx, { ...validInput, capacity });
    if (!draft.ok) throw new Error("seed failed: " + draft.value.message);
    const pub = await service.publishEvent(staffCtx, draft.value.id);
    if (!pub.ok) throw new Error("publish failed: " + pub.value.message);
    return { service, event: pub.value };
  }

  it("happy path: member RSVPs to a published event", async () => {
    const { service, event } = await seedPublishedEvent();
    const result = await service.toggleRsvp(userCtx, event.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome).toBe("attending");
      expect(result.value.attendeeCount).toBe(1);
    }
  });

  it("happy path: member is waitlisted when event is full", async () => {
    const { service, event } = await seedPublishedEvent(1);
    const userCtx2 = { userId: "user-member-2", role: "user" as const };
    await service.toggleRsvp(userCtx, event.id);
    const result = await service.toggleRsvp(userCtx2, event.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome).toBe("waitlisted");
      expect(result.value.attendeeCount).toBe(1);
    }
  });

  it("happy path: second toggle cancels an active RSVP", async () => {
    const { service, event } = await seedPublishedEvent();
    await service.toggleRsvp(userCtx, event.id);
    const result = await service.toggleRsvp(userCtx, event.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome).toBe("cancelled");
      expect(result.value.attendeeCount).toBe(0);
    }
  });

  it("happy path: third toggle reactivates a cancelled RSVP", async () => {
    const { service, event } = await seedPublishedEvent();
    await service.toggleRsvp(userCtx, event.id);
    await service.toggleRsvp(userCtx, event.id);
    const result = await service.toggleRsvp(userCtx, event.id);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outcome).toBe("attending");
  });

  it("happy path: reactivated RSVP lands on waitlist when now full", async () => {
    const { service, event } = await seedPublishedEvent(1);
    const userCtx2 = { userId: "user-member-2", role: "user" as const };
    await service.toggleRsvp(userCtx, event.id);
    await service.toggleRsvp(userCtx2, event.id);
    await service.toggleRsvp(userCtx2, event.id);
    const result = await service.toggleRsvp(userCtx2, event.id);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outcome).toBe("waitlisted");
  });

  it("happy path: unlimited capacity never waitlists", async () => {
    const { service, event } = await seedPublishedEvent(null);
    for (let i = 0; i < 5; i++) {
      const r = await service.toggleRsvp({ userId: `user-${i}`, role: "user" }, event.id);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.outcome).toBe("attending");
    }
  });

  it("error: staff cannot RSVP", async () => {
    const { service, event } = await seedPublishedEvent();
    const result = await service.toggleRsvp(staffCtx, event.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.value.name).toBe("Forbidden");
  });

  it("error: admin cannot RSVP", async () => {
    const { service, event } = await seedPublishedEvent();
    const result = await service.toggleRsvp(adminCtx, event.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.value.name).toBe("Forbidden");
  });

  it("error: cannot RSVP to a draft event", async () => {
    const service = createService();
    const draft = await service.createEvent(staffCtx, validInput);
    if (!draft.ok) throw new Error("seed failed");
    const result = await service.toggleRsvp(userCtx, draft.value.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.value.name).toBe("UneditableStatus");
  });

  it("error: cannot RSVP to a cancelled event", async () => {
    const { service, event } = await seedPublishedEvent();
    await service.cancelEvent(staffCtx, event.id);
    const result = await service.toggleRsvp(userCtx, event.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.value.name).toBe("UneditableStatus");
  });

  it("error: unknown event id returns EventNotFound", async () => {
    const service = createService();
    const result = await service.toggleRsvp(userCtx, "no-such-id");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.value.name).toBe("EventNotFound");
  });
});