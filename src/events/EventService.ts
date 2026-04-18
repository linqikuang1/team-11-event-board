import { Err, Ok, type Result } from "../lib/result";
import type { IUserRepository } from "../auth/UserRepository";
import {
  EventFull,
  EventNotFound,
  Forbidden,
  UneditableStatus,
  UnexpectedDependencyError,
  ValidationError,
  InvalidTransition,
  type EventError,
} from "./errors";
import type { IEventRepository } from "./EventRepository";
import type { IEventRecord } from "./Event";
import type { IRsvpRepository, IRsvpRecord } from "./RsvpRepository";

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

export type ToggleRsvpOutcome = "attending" | "waitlisted" | "cancelled";

export interface ToggleRsvpResult {
  rsvp: IRsvpRecord;
  outcome: ToggleRsvpOutcome;
  attendeeCount: number;
}

export interface AttendeeListEntry {
  userId: string;
  displayName: string;
  status: IRsvpRecord["status"];
  rsvpedAt: string;
}

export interface AttendeeListResult {
  event: IEventRecord;
  attending: AttendeeListEntry[];
  waitlisted: AttendeeListEntry[];
  cancelled: AttendeeListEntry[];
}

export interface IEventService {
  createEvent(ctx: SessionContext, input: CreateEventInput): Promise<Result<IEventRecord, EventError>>;
  getEventById(ctx: SessionContext, eventId: string): Promise<Result<IEventRecord, EventError>>;
  updateEvent(ctx: SessionContext, eventId: string, input: UpdateEventInput): Promise<Result<IEventRecord, EventError>>;
  searchEvents(ctx: SessionContext, query: string): Promise<Result<IEventRecord[], EventError>>;
  publishEvent(ctx: SessionContext, eventId: string): Promise<Result<IEventRecord, EventError>>;
  cancelEvent(ctx: SessionContext, eventId: string): Promise<Result<IEventRecord, EventError>>;
  toggleRsvp(ctx: SessionContext, eventId: string): Promise<Result<ToggleRsvpResult, EventError>>;
  listAttendees(ctx: SessionContext, eventId: string): Promise<Result<AttendeeListResult, EventError>>;
}

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

class EventService implements IEventService {
  constructor(
    private readonly events: IEventRepository,
    private readonly rsvps: IRsvpRepository,
    private readonly users: IUserRepository,
  ) {}

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

  async getEventById(
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

    if (event.status === "draft" && ctx.role === "user") {
      return Err(EventNotFound("Event not found."));
    }

    if (event.status === "draft" && ctx.role === "staff" && event.organizerId !== ctx.userId) {
      return Err(EventNotFound("Event not found."));
    }

    return Ok(event);
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

  async searchEvents(
    ctx: SessionContext,
    query: string,
  ): Promise<Result<IEventRecord[], EventError>> {
    const normalized = query.trim().toLowerCase();

    const allResult = await this.events.findAll();
    if (allResult.ok === false) {
      return Err(UnexpectedDependencyError(allResult.value.message));
    }

    const now = Date.now();

    let results = allResult.value.filter((event) => {
      const isPublished = event.status === "published";
      const isUpcoming = new Date(event.endTime).getTime() > now;
      return isPublished && isUpcoming;
    });

    if (normalized.length === 0) {
      results.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
      return Ok(results);
    }

    results = results.filter((event) => {
      return (
        event.title.toLowerCase().includes(normalized) ||
        event.description.toLowerCase().includes(normalized) ||
        event.location.toLowerCase().includes(normalized)
      );
    });

    results.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    return Ok(results);
  }

  async toggleRsvp(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<ToggleRsvpResult, EventError>> {
    if (ctx.role !== "user") {
      return Err(Forbidden("Organizers and admins cannot RSVP to events."));
    }

    const findResult = await this.events.findById(eventId);
    if (findResult.ok === false) {
      return Err(UnexpectedDependencyError(findResult.value.message));
    }
    if (!findResult.value) {
      return Err(EventNotFound("Event not found."));
    }

    const event = findResult.value;

    if (event.status === "cancelled") {
      return Err(UneditableStatus("Cannot RSVP to a cancelled event."));
    }
    if (event.status !== "published") {
      return Err(UneditableStatus("Cannot RSVP to an event that is not published."));
    }
    if (new Date(event.startTime) <= new Date()) {
      return Err(UneditableStatus("Cannot RSVP to an event that has already started."));
    }

    const existingResult = await this.rsvps.findByEventAndUser(eventId, ctx.userId);
    if (existingResult.ok === false) {
      return Err(UnexpectedDependencyError(existingResult.value.message));
    }

    const existing = existingResult.value;
    const now = new Date().toISOString();

    if (existing && (existing.status === "attending" || existing.status === "waitlisted")) {
      const cancelled: IRsvpRecord = { ...existing, status: "cancelled", updatedAt: now };
      const saveResult = await this.rsvps.save(cancelled);
      if (saveResult.ok === false) {
        return Err(UnexpectedDependencyError(saveResult.value.message));
      }

      const countResult = await this.rsvps.findAllByEvent(eventId, { status: "attending" });
      if (countResult.ok === false) {
        return Err(UnexpectedDependencyError(countResult.value.message));
      }

      return Ok<ToggleRsvpResult>({
        rsvp: saveResult.value,
        outcome: "cancelled",
        attendeeCount: countResult.value.length,
      });
    }

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

    const finalCount = newStatus === "attending" ? attendeeCount + 1 : attendeeCount;

    return Ok<ToggleRsvpResult>({
      rsvp: saveResult.value,
      outcome: newStatus,
      attendeeCount: finalCount,
    });
  }

  async listAttendees(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<AttendeeListResult, EventError>> {
    const eventResult = await this.events.findById(eventId);
    if (eventResult.ok === false) {
      return Err(UnexpectedDependencyError(eventResult.value.message));
    }
    if (!eventResult.value) {
      return Err(EventNotFound("Event not found."));
    }

    const event = eventResult.value;

    if (ctx.role === "user") {
      return Err(Forbidden("Members cannot view attendee lists."));
    }

    if (ctx.role === "staff" && event.organizerId !== ctx.userId) {
      return Err(Forbidden("You do not have permission to view this attendee list."));
    }

    const rsvpResult = await this.rsvps.findAllByEvent(eventId);
    if (rsvpResult.ok === false) {
      return Err(UnexpectedDependencyError(rsvpResult.value.message));
    }

    const entries: AttendeeListEntry[] = [];
    for (const rsvp of rsvpResult.value) {
      const userResult = await this.users.findById(rsvp.userId);
      if (userResult.ok === false) {
        return Err(UnexpectedDependencyError(userResult.value.message));
      }

      const displayName = userResult.value?.displayName ?? "Unknown user";
      entries.push({
        userId: rsvp.userId,
        displayName,
        status: rsvp.status,
        rsvpedAt: rsvp.createdAt,
      });
    }

    const byCreatedAtAsc = (a: AttendeeListEntry, b: AttendeeListEntry): number =>
      new Date(a.rsvpedAt).getTime() - new Date(b.rsvpedAt).getTime();

    const attending = entries
      .filter((entry) => entry.status === "attending")
      .sort(byCreatedAtAsc);
    const waitlisted = entries
      .filter((entry) => entry.status === "waitlisted")
      .sort(byCreatedAtAsc);
    const cancelled = entries
      .filter((entry) => entry.status === "cancelled")
      .sort(byCreatedAtAsc);

    return Ok({
      event,
      attending,
      waitlisted,
      cancelled,
    });
  }

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

    if (ctx.role === "user") {
      return Err(Forbidden("Members cannot publish events."));
    }
    if (ctx.role === "staff" && event.organizerId !== ctx.userId) {
      return Err(Forbidden("You do not have permission to publish this event."));
    }

    if (event.status !== "draft") {
      return Err(InvalidTransition(`Cannot publish an event that is already ${event.status}.`));
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

    if (ctx.role === "user") {
      return Err(Forbidden("Members cannot cancel events."));
    }
    if (ctx.role === "staff" && event.organizerId !== ctx.userId) {
      return Err(Forbidden("You do not have permission to cancel this event."));
    }

    if (event.status === "cancelled") {
      return Err(InvalidTransition("Event is already cancelled."));
    }
    if (event.status !== "published") {
      return Err(InvalidTransition(`Cannot cancel an event that is ${event.status}. Only published events can be cancelled.`));
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

export function CreateEventService(
  events: IEventRepository,
  rsvps: IRsvpRepository,
  users: IUserRepository,
): IEventService {
  return new EventService(events, rsvps, users);
}