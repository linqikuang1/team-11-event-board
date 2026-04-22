import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";
import type { IEventRecord } from "../../src/events/Event";
import { CreateInMemoryEventRepository } from "../../src/events/InMemoryEventRepository";
import { CreateInMemoryRsvpRepository } from "../../src/events/InMemoryRsvpRepository";
import { CreateEventService, type SessionContext } from "../../src/events/EventService";

function eventRecord(
  id: string,
  overrides: Partial<IEventRecord> = {},
): IEventRecord {
  const now = new Date().toISOString();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

  return {
    id,
    title: "Sample Event",
    description: "Sample description",
    location: "Campus Hall",
    startTime: start,
    endTime: end,
    status: "published",
    organizerId: "user-staff",
    createdAt: now,
    updatedAt: now,
    capacity: null,
    tags: ["General"],
    ...overrides,
  };
}

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function upcomingWeekendSaturday(): Date {
  const now = new Date();
  const day = now.getDay();
  const saturday = startOfDay(now);

  if (day === 0) {
    saturday.setDate(saturday.getDate() - 1);
    return saturday;
  }

  const daysUntilSaturday = (6 - day + 7) % 7;
  saturday.setDate(saturday.getDate() + daysUntilSaturday);
  return saturday;
}

function userCtx(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    userId: "user-reader",
    role: "user",
    ...overrides,
  };
}

describe("EventService filters", () => {
  it("returns all upcoming published events when no filters are provided", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    const now = Date.now();
    await events.save(eventRecord("published-upcoming-1"));
    await events.save(eventRecord("published-upcoming-2", { title: "Second Event" }));
    await events.save(eventRecord("draft-upcoming", { status: "draft" }));
    await events.save(
      eventRecord("published-past", {
        startTime: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );

    const result = await service.searchEvents(userCtx(), {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((event) => event.id)).toEqual([
        "published-upcoming-1",
        "published-upcoming-2",
      ]);
    }
  });

  it("applies q, category, and timeframe together", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    const saturday = upcomingWeekendSaturday();
    const saturdayStart = new Date(saturday);
    saturdayStart.setHours(10, 0, 0, 0);
    const saturdayEnd = new Date(saturday);
    saturdayEnd.setHours(12, 0, 0, 0);

    await events.save(
      eventRecord("weekend-match", {
        title: "Music Night",
        location: "Main Stage",
        startTime: saturdayStart.toISOString(),
        endTime: saturdayEnd.toISOString(),
        tags: ["Music"],
      }),
    );
    await events.save(
      eventRecord("category-miss", {
        title: "Music Workshop",
        startTime: saturdayStart.toISOString(),
        endTime: saturdayEnd.toISOString(),
        tags: ["Tech"],
      }),
    );
    await events.save(
      eventRecord("query-miss", {
        title: "Career Fair",
        startTime: saturdayStart.toISOString(),
        endTime: saturdayEnd.toISOString(),
        tags: ["Music"],
      }),
    );

    const result = await service.searchEvents(userCtx(), {
      q: "music",
      category: "Music",
      timeframe: "weekend",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((event) => event.id)).toEqual(["weekend-match"]);
    }
  });

  it("returns a typed error for invalid timeframe values", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    const result = await service.searchEvents(userCtx(), {
      timeframe: "next-month",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("InvalidFilterValue");
      expect(result.value.message).toContain("Timeframe");
    }
  });

  it("returns a typed error for invalid category values", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    const result = await service.searchEvents(userCtx(), {
      category: "Music!!",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("InvalidFilterValue");
      expect(result.value.message).toContain("Category");
    }
  });
});

describe("EventService listAttendees", () => {
  it("allows an organizer staff user to view their event attendee list", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    await events.save(eventRecord("event-owned", { organizerId: "user-staff" }));
    const now = new Date().toISOString();
    await rsvps.save({
      eventId: "event-owned",
      userId: "user-reader",
      status: "attending",
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.listAttendees({ userId: "user-staff", role: "staff" }, "event-owned");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.event.id).toBe("event-owned");
      expect(result.value.attending).toHaveLength(1);
      expect(result.value.attending[0].displayName).toBe("Una User");
    }
  });

  it("allows admin to view attendee list for any event", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    await events.save(eventRecord("event-other-organizer", { organizerId: "different-staff" }));

    const result = await service.listAttendees({ userId: "user-admin", role: "admin" }, "event-other-organizer");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.event.id).toBe("event-other-organizer");
    }
  });

  it("rejects member access to attendee lists", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    await events.save(eventRecord("event-visible"));
    const result = await service.listAttendees({ userId: "user-reader", role: "user" }, "event-visible");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("Forbidden");
      expect(result.value.message).toContain("Members");
    }
  });

  it("rejects staff user who does not own the event", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    await events.save(eventRecord("event-not-owned", { organizerId: "some-other-staff" }));
    const result = await service.listAttendees({ userId: "user-staff", role: "staff" }, "event-not-owned");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("Forbidden");
      expect(result.value.message).toContain("permission");
    }
  });

  it("returns event-not-found when event does not exist", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    const result = await service.listAttendees({ userId: "user-admin", role: "admin" }, "missing-event");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventNotFound");
    }
  });

  it("groups attendees by status and sorts each group by createdAt ascending", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    await users.createUser({
      id: "attending-early",
      email: "attending-early@app.test",
      displayName: "Attending Early",
      role: "user",
      passwordHash: "hash-1",
    });
    await users.createUser({
      id: "attending-late",
      email: "attending-late@app.test",
      displayName: "Attending Late",
      role: "user",
      passwordHash: "hash-2",
    });
    await users.createUser({
      id: "waitlisted-user",
      email: "waitlisted@app.test",
      displayName: "Waitlisted User",
      role: "user",
      passwordHash: "hash-3",
    });
    await users.createUser({
      id: "cancelled-user",
      email: "cancelled@app.test",
      displayName: "Cancelled User",
      role: "user",
      passwordHash: "hash-4",
    });

    await events.save(eventRecord("event-grouped", { organizerId: "user-staff" }));

    await rsvps.save({
      eventId: "event-grouped",
      userId: "attending-late",
      status: "attending",
      createdAt: "2026-01-01T11:00:00.000Z",
      updatedAt: "2026-01-01T11:00:00.000Z",
    });
    await rsvps.save({
      eventId: "event-grouped",
      userId: "attending-early",
      status: "attending",
      createdAt: "2026-01-01T09:00:00.000Z",
      updatedAt: "2026-01-01T09:00:00.000Z",
    });
    await rsvps.save({
      eventId: "event-grouped",
      userId: "waitlisted-user",
      status: "waitlisted",
      createdAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-01T10:00:00.000Z",
    });
    await rsvps.save({
      eventId: "event-grouped",
      userId: "cancelled-user",
      status: "cancelled",
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    });
    await rsvps.save({
      eventId: "event-grouped",
      userId: "missing-user-id",
      status: "waitlisted",
      createdAt: "2026-01-01T08:00:00.000Z",
      updatedAt: "2026-01-01T08:00:00.000Z",
    });

    const result = await service.listAttendees({ userId: "user-staff", role: "staff" }, "event-grouped");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.attending.map((entry) => entry.displayName)).toEqual([
        "Attending Early",
        "Attending Late",
      ]);

      expect(result.value.waitlisted.map((entry) => entry.rsvpedAt)).toEqual([
        "2026-01-01T08:00:00.000Z",
        "2026-01-01T10:00:00.000Z",
      ]);
      expect(result.value.waitlisted[0].displayName).toBe("Unknown user");

      expect(result.value.cancelled.map((entry) => entry.displayName)).toEqual([
        "Cancelled User",
      ]);
    }
  });
});
describe("EventService archive", () => {
  it("transitions expired published events to concluded", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    const now = Date.now();

    await events.save(
      eventRecord("expired-published", {
        status: "published",
        startTime: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      }),
    );

    const result = await service.transitionExpiredEvents(userCtx());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1);
    }

    const updated = await events.findById("expired-published");
    expect(updated.ok).toBe(true);
    if (updated.ok && updated.value) {
      expect(updated.value.status).toBe("concluded");
    }
  });

  it("does not change non-expired events", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    await events.save(
      eventRecord("future-published", {
        status: "published",
      }),
    );

    const result = await service.transitionExpiredEvents(userCtx());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }

    const updated = await events.findById("future-published");
    expect(updated.ok).toBe(true);
    if (updated.ok && updated.value) {
      expect(updated.value.status).toBe("published");
    }
  });

  it("returns archived events in reverse chronological order", async () => {
    const events = CreateInMemoryEventRepository();
    const rsvps = CreateInMemoryRsvpRepository();
    const users = CreateInMemoryUserRepository();
    const service = CreateEventService(events, rsvps, users);

    await events.save(
      eventRecord("older-archived", {
        status: "concluded",
        endTime: "2026-01-01T10:00:00.000Z",
      }),
    );

    await events.save(
      eventRecord("newer-archived", {
        status: "concluded",
        endTime: "2026-02-01T10:00:00.000Z",
      }),
    );

    const result = await service.getArchivedEvents(userCtx());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((event) => event.id)).toEqual([
        "newer-archived",
        "older-archived",
      ]);
    }
  });
});
