import { Err, Ok, type Result } from "../lib/result";
import {
  EventFull,
  EventNotFound,
  Forbidden,
  InvalidTransition,
  UneditableStatus,
  UnexpectedDependencyError,
  ValidationError,
  type EventError,
} from "./errors";
import type { IEventRepository } from "./EventRepository";
import type { IEventRecord } from "./Event";
import type { IRsvpRepository, IRsvpRecord } from "./RsvpRepository";

// ─── Input / context types ────────────────────────────────────────────────────

export interface CreateEventInput {
  title: string;
  description?: string;
  location: string;
  startTime: string;
  endTime: string;
  capacity?: number | null;
  tags?: string[];
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  capacity?: number | null;
  tags?: string[];
}

export interface SessionContext {
  userId: string;
  role: "admin" | "staff" | "user";
}

// ─── RSVP toggle result ───────────────────────────────────────────────────────

export type ToggleRsvpOutcome = "attending" | "waitlisted" | "cancelled";

export interface ToggleRsvpResult {
  rsvp: IRsvpRecord;
  outcome: ToggleRsvpOutcome;
  attendeeCount: number;
}

// ─── Service interface ────────────────────────────────────────────────────────

export interface IEventService {
  createEvent(
    ctx: SessionContext,
    input: CreateEventInput,
  ): Promise<Result<IEventRecord, EventError>>;

  updateEvent(
    ctx: SessionContext,
    eventId: string,
    input: UpdateEventInput,
  ): Promise<Result<IEventRecord, EventError>>;

  /**
   * Toggle the calling user's RSVP on an event.
   *
   * - If they have no active RSVP → add them (attending or waitlisted).
   * - If they are already attending or waitlisted → cancel their RSVP.
   * - Organizers, admins, and RSVPs on cancelled/past events are rejected.
   */
  toggleRsvp(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<ToggleRsvpResult, EventError>>;

  /**
   * Transition a draft event to published.
   * Only the organizer (staff who created it) or an admin may do this.
   */
  publishEvent(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<IEventRecord, EventError>>;

  /**
   * Cancel a published event permanently.
   * The organizer may cancel their own event; admins may cancel any event.
   */
  cancelEvent(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<IEventRecord, EventError>>;
}

// ─── Validation (unchanged from original) ────────────────────────────────────

function validateEventInput(
  input: CreateEventInput | UpdateEventInput,
): Record<string, string> | null {
  const fields: Record<string, string> = {};

  if ("title" in input && input.title !== undefined) {
    if (!input.title || input.title.trim().length === 0) {
      fields.title = "Title is required.";
    } else if (input.title.length > 200) {
      fields.title = "Title must be 200 characters or fewer.";
    }
  }

  if (input.description && input.description.length > 5000) {
    fields.description = "Description must be 5000 characters or fewer.";
  }

  if ("location" in input && input.location !== undefined) {
    if (!input.location || input.location.trim().length === 0) {
      fields.location = "Location is required.";
    } else if (input.location.length > 300) {
      fields.location = "Location must be 300 characters or fewer.";
    }
  }

  if ("startTime" in input && input.startTime !== undefined) {
    const start = new Date(input.startTime + ":00");
    if (isNaN(start.getTime())) {
      fields.startTime = "Start time must be a valid date.";
    } else if (start.getTime() <= Date.now()) {
      fields.startTime = "Start time must be in the future.";
    }
  }

  if ("endTime" in input && input.endTime !== undefined) {
    const end = new Date(input.endTime + ":00");
    if (isNaN(end.getTime())) {
      fields.endTime = "End time must be a valid date.";
    } else if ("startTime" in input && input.startTime) {
      const start = new Date(input.startTime + ":00");
      if (end <= start) {
        fields.endTime = "End time must be after start time.";
      }
    }
  }

  if (input.capacity !== undefined && input.capacity !== null) {
    if (!Number.isInteger(input.capacity) || input.capacity < 1) {
      fields.capacity = "Capacity must be a positive integer.";
    }
  }

  if (input.tags !== undefined) {
    if (input.tags.length > 10) {
      fields.tags = "Maximum 10 tags allowed.";
    } else if (input.tags.some((t) => t.length === 0 || t.length > 50)) {
      fields.tags = "Each tag must be between 1 and 50 characters.";
    }
  }

  return Object.keys(fields).length > 0 ? fields : null;
}

// ─── Implementation ───────────────────────────────────────────────────────────

class EventService implements IEventService {
  constructor(
    private readonly events: IEventRepository,
    private readonly rsvps: IRsvpRepository,
  ) {}

  // ── Existing methods (unchanged) ──────────────────────────────────────────

  async createEvent(
    ctx: SessionContext,
    input: CreateEventInput,
  ): Promise<Result<IEventRecord, EventError>> {
    if (ctx.role === "user") {
      return Err(Forbidden("Only staff and admins can create events."));
    }

    const fields = validateEventInput(input);
    if (fields) {
      return Err(ValidationError("Invalid event input.", fields));
    }

    const now = new Date().toISOString();
    const event: IEventRecord = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      location: input.location.trim(),
      startTime: input.startTime,
      endTime: input.endTime,
      status: "draft",
      organizerId: ctx.userId,
      createdAt: now,
      updatedAt: now,
      capacity: input.capacity ?? null,
      tags: input.tags ?? [],
    };

    const result = await this.events.save(event);
    if (result.ok === false) {
      return Err(UnexpectedDependencyError(result.value.message));
    }

    return Ok(result.value);
  }

  async updateEvent(
    ctx: SessionContext,
    eventId: string,
    input: UpdateEventInput,
  ): Promise<Result<IEventRecord, EventError>> {
    if (ctx.role === "user") {
      return Err(Forbidden("Only staff and admins can edit events."));
    }

    const findResult = await this.events.findById(eventId);
    if (findResult.ok === false) {
      return Err(UnexpectedDependencyError(findResult.value.message));
    }
    if (!findResult.value) {
      return Err(EventNotFound("Event not found."));
    }

    const event = findResult.value;

    if (ctx.role === "staff" && event.organizerId !== ctx.userId) {
      return Err(Forbidden("You do not have permission to edit this event."));
    }

    if (event.status === "cancelled" || event.status === "concluded") {
      return Err(UneditableStatus(`Cannot edit an event that is ${event.status}.`));
    }

    const fields = validateEventInput(input);
    if (fields) {
      return Err(ValidationError("Invalid event input.", fields));
    }

    const updated: IEventRecord = {
      ...event,
      title: input.title?.trim() ?? event.title,
      description: input.description?.trim() ?? event.description,
      location: input.location?.trim() ?? event.location,
      startTime: input.startTime ?? event.startTime,
      endTime: input.endTime ?? event.endTime,
      capacity: input.capacity !== undefined ? input.capacity : event.capacity,
      tags: input.tags ?? event.tags,
      updatedAt: new Date().toISOString(),
    };

    const saveResult = await this.events.save(updated);
    if (saveResult.ok === false) {
      return Err(UnexpectedDependencyError(saveResult.value.message));
    }

    return Ok(saveResult.value);
  }

  // ── Feature 4: RSVP toggle ────────────────────────────────────────────────

  async toggleRsvp(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<ToggleRsvpResult, EventError>> {
    // Organizers and admins do not RSVP to events they manage.
    if (ctx.role !== "user") {
      return Err(Forbidden("Organizers and admins cannot RSVP to events."));
    }

    // Resolve the event.
    const findResult = await this.events.findById(eventId);
    if (findResult.ok === false) {
      return Err(UnexpectedDependencyError(findResult.value.message));
    }
    if (!findResult.value) {
      return Err(EventNotFound("Event not found."));
    }

    const event = findResult.value;

    // RSVPs are only valid on published, future events.
    if (event.status === "cancelled") {
      return Err(UneditableStatus("Cannot RSVP to a cancelled event."));
    }
    if (event.status !== "published") {
      return Err(UneditableStatus("Cannot RSVP to an event that is not published."));
    }
    if (new Date(event.startTime) <= new Date()) {
      return Err(UneditableStatus("Cannot RSVP to an event that has already started."));
    }

    // Load the caller's existing RSVP, if any.
    const existingResult = await this.rsvps.findByEventAndUser(eventId, ctx.userId);
    if (existingResult.ok === false) {
      return Err(UnexpectedDependencyError(existingResult.value.message));
    }

    const existing = existingResult.value;
    const now = new Date().toISOString();

    // ── Case 1: Cancel an active RSVP
    if (existing && (existing.status === "attending" || existing.status === "waitlisted")) {
      const cancelled: IRsvpRecord = { ...existing, status: "cancelled", updatedAt: now };
      const saveResult = await this.rsvps.save(cancelled);
      if (saveResult.ok === false) {
        return Err(UnexpectedDependencyError(saveResult.value.message));
      }

      // Re-count active attendees after cancellation.
      const countResult = await this.rsvps.findAllByEvent(eventId, { status: "attending" });
      if (countResult.ok === false) {
        return Err(UnexpectedDependencyError(countResult.value.message));
      }

      return Ok({
        rsvp: saveResult.value,
        outcome: "cancelled",
        attendeeCount: countResult.value.length,
      });
    }

    // ── Case 2 & 3: New RSVP or reactivating a previously cancelled one ────

    // Count current active attendees to decide attending vs waitlisted.
    const attendingResult = await this.rsvps.findAllByEvent(eventId, { status: "attending" });
    if (attendingResult.ok === false) {
      return Err(UnexpectedDependencyError(attendingResult.value.message));
    }

    const attendeeCount = attendingResult.value.length;
    const isFull = event.capacity !== null && attendeeCount >= event.capacity;
    const newStatus = isFull ? "waitlisted" : "attending";

    const upserted: IRsvpRecord = existing
      ? { ...existing, status: newStatus, updatedAt: now }
      : { eventId, userId: ctx.userId, status: newStatus, createdAt: now, updatedAt: now };

    const saveResult = await this.rsvps.save(upserted);
    if (saveResult.ok === false) {
      return Err(UnexpectedDependencyError(saveResult.value.message));
    }

    // Final attendee count (include the new attendee if not waitlisted).
    const finalCount = newStatus === "attending" ? attendeeCount + 1 : attendeeCount;

    return Ok({
      rsvp: saveResult.value,
      outcome: newStatus,
      attendeeCount: finalCount,
    });
  }

  // ── Feature 5: Lifecycle transitions ─────────────────────────────────────

  async publishEvent(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<IEventRecord, EventError>> {
    const findResult = await this.events.findById(eventId);
    if (findResult.ok === false) {
      return Err(UnexpectedDependencyError(findResult.value.message));
    }
    if (!findResult.value) {
      return Err(EventNotFound("Event not found."));
    }

    const event = findResult.value;

    // Ownership: staff may only publish their own events; admins may publish any.
    if (ctx.role === "user") {
      return Err(Forbidden("Members cannot publish events."));
    }
    if (ctx.role === "staff" && event.organizerId !== ctx.userId) {
      return Err(Forbidden("You do not have permission to publish this event."));
    }

    // State guard: only draft → published is valid.
    if (event.status !== "draft") {
      return Err(
        InvalidTransition(
          `Cannot publish an event that is already ${event.status}.`,
        ),
      );
    }

    const updated: IEventRecord = {
      ...event,
      status: "published",
      updatedAt: new Date().toISOString(),
    };

    const saveResult = await this.events.save(updated);
    if (saveResult.ok === false) {
      return Err(UnexpectedDependencyError(saveResult.value.message));
    }

    return Ok(saveResult.value);
  }

  async cancelEvent(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<IEventRecord, EventError>> {
    const findResult = await this.events.findById(eventId);
    if (findResult.ok === false) {
      return Err(UnexpectedDependencyError(findResult.value.message));
    }
    if (!findResult.value) {
      return Err(EventNotFound("Event not found."));
    }

    const event = findResult.value;

    // Ownership: staff may only cancel their own events; admins may cancel any.
    if (ctx.role === "user") {
      return Err(Forbidden("Members cannot cancel events."));
    }
    if (ctx.role === "staff" && event.organizerId !== ctx.userId) {
      return Err(Forbidden("You do not have permission to cancel this event."));
    }

    // State guard: only published → cancelled is valid (draft events are just deleted, not cancelled).
    if (event.status === "cancelled") {
      return Err(InvalidTransition("Event is already cancelled."));
    }
    if (event.status !== "published") {
      return Err(
        InvalidTransition(
          `Cannot cancel an event that is ${event.status}. Only published events can be cancelled.`,
        ),
      );
    }

    const updated: IEventRecord = {
      ...event,
      status: "cancelled",
      updatedAt: new Date().toISOString(),
    };

    const saveResult = await this.events.save(updated);
    if (saveResult.ok === false) {
      return Err(UnexpectedDependencyError(saveResult.value.message));
    }

    return Ok(saveResult.value);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function CreateEventService(
  events: IEventRepository,
  rsvps: IRsvpRepository,
): IEventService {
  return new EventService(events, rsvps);
}