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
