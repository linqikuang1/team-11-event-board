import type { IEventRecord } from "../../src/events/Event";
import { CreateInMemoryEventRepository } from "../../src/events/InMemoryEventRepository";
import type { SessionContext } from "../../src/events/EventService";
import { CreateInMemorySavedEventRepository } from "../../src/saved/InMemorySavedEventRepository";
import { CreateSavedEventService } from "../../src/saved/SavedEventService";

function makeEvent(overrides: Partial<IEventRecord> = {}): IEventRecord {
  const now = Date.now();
  return {
    id: "event-1",
    title: "Saved Event",
    description: "Test event for saved feature",
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

function memberCtx(overrides: Partial<SessionContext> = {}): SessionContext {
  return { userId: "user-1", role: "user", ...overrides };
}

describe("SavedEventService", () => {
  it("toggles save: first call saves, second call unsaves", async () => {
    const events = CreateInMemoryEventRepository();
    const saved = CreateInMemorySavedEventRepository();
    const service = CreateSavedEventService(saved, events);
    await events.save(makeEvent());

    const first = await service.toggleSave(memberCtx(), "event-1");
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.saved).toBe(true);
    }

    const second = await service.toggleSave(memberCtx(), "event-1");
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.saved).toBe(false);
    }
  });

  it("rejects save attempts by non-member roles", async () => {
    const events = CreateInMemoryEventRepository();
    const saved = CreateInMemorySavedEventRepository();
    const service = CreateSavedEventService(saved, events);
    await events.save(makeEvent());

    const staff = await service.toggleSave({ userId: "staff-1", role: "staff" }, "event-1");
    const admin = await service.toggleSave({ userId: "admin-1", role: "admin" }, "event-1");

    expect(staff.ok).toBe(false);
    expect(admin.ok).toBe(false);
    if (!staff.ok) expect(staff.value.name).toBe("Forbidden");
    if (!admin.ok) expect(admin.value.name).toBe("Forbidden");
  });

  it("returns EventNotFound when saving a missing event", async () => {
    const events = CreateInMemoryEventRepository();
    const saved = CreateInMemorySavedEventRepository();
    const service = CreateSavedEventService(saved, events);

    const result = await service.toggleSave(memberCtx(), "no-such-event");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("EventNotFound");
    }
  });

  it("returns EventNotSaveable for cancelled and concluded events", async () => {
    const events = CreateInMemoryEventRepository();
    const saved = CreateInMemorySavedEventRepository();
    const service = CreateSavedEventService(saved, events);
    await events.save(makeEvent({ id: "cancelled-event", status: "cancelled" }));
    await events.save(makeEvent({ id: "concluded-event", status: "concluded" }));

    const cancelled = await service.toggleSave(memberCtx(), "cancelled-event");
    const concluded = await service.toggleSave(memberCtx(), "concluded-event");

    expect(cancelled.ok).toBe(false);
    expect(concluded.ok).toBe(false);
    if (!cancelled.ok) expect(cancelled.value.name).toBe("EventNotSaveable");
    if (!concluded.ok) expect(concluded.value.name).toBe("EventNotSaveable");
  });

  it("lists saved events for members and blocks non-members", async () => {
    const events = CreateInMemoryEventRepository();
    const saved = CreateInMemorySavedEventRepository();
    const service = CreateSavedEventService(saved, events);
    await events.save(makeEvent({ id: "event-1" }));
    await events.save(makeEvent({ id: "event-2" }));

    await service.toggleSave(memberCtx(), "event-1");
    await service.toggleSave(memberCtx(), "event-2");

    const memberList = await service.listSavedEvents(memberCtx());
    expect(memberList.ok).toBe(true);
    if (memberList.ok) {
      expect(memberList.value).toHaveLength(2);
      expect(memberList.value.every((entry) => entry.savedEvent.userId === "user-1")).toBe(true);
    }

    const staffList = await service.listSavedEvents({ userId: "staff-1", role: "staff" });
    expect(staffList.ok).toBe(false);
    if (!staffList.ok) {
      expect(staffList.value.name).toBe("Forbidden");
    }
  });
});
