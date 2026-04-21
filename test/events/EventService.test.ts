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
