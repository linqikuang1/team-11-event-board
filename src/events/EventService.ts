import { Err, Ok, type Result } from "../lib/result";
import type { IUserRepository } from "../auth/UserRepository";
import {
  EventFull,
  EventNotFound,
  Forbidden,
  InvalidFilterValue,
  UneditableStatus,
  UnexpectedDependencyError,
  ValidationError,
  InvalidTransition,
  type EventError,
} from "./errors";
import type { IEventRepository } from "./EventRepository";
import type { IEventRecord } from "./Event";
import type { IRsvpRepository, IRsvpRecord, RsvpStatus } from "./RsvpRepository";

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

export type EventFilterTimeframe = "all" | "week" | "weekend";

export interface EventFilterInput {
  q?: string;
  category?: string;
  timeframe?: string;
}

interface NormalizedEventFilters {
  q: string;
  category: string | null;
  timeframe: EventFilterTimeframe;
}

export type ToggleRsvpOutcome = "attending" | "waitlisted" | "cancelled";

export interface ToggleRsvpResult {
  rsvp: IRsvpRecord;
  outcome: ToggleRsvpOutcome;
  attendeeCount: number;
  event: IEventRecord;
}

export interface RsvpStateResult {
  outcome: RsvpStatus | null;  
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
  searchEvents(
    ctx: SessionContext,
    filters: EventFilterInput,
  ): Promise<Result<IEventRecord[], EventError>>;
  publishEvent(ctx: SessionContext, eventId: string): Promise<Result<IEventRecord, EventError>>;
  cancelEvent(ctx: SessionContext, eventId: string): Promise<Result<IEventRecord, EventError>>;
  toggleRsvp(ctx: SessionContext, eventId: string): Promise<Result<ToggleRsvpResult, EventError>>;
  listAttendees(ctx: SessionContext, eventId: string): Promise<Result<AttendeeListResult, EventError>>;
  transitionExpiredEvents(ctx: SessionContext): Promise<Result<number, EventError>>;
  getArchivedEvents(ctx: SessionContext, category?: string): Promise<Result<IEventRecord[], EventError>>;
  getRsvpState(ctx: SessionContext, eventId: string,): Promise<Result<RsvpStateResult, EventError>>;
  deleteEvent(ctx: SessionContext, eventId: string): Promise<Result<boolean, EventError>>;
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

function normalizeEventFilters(
  filters: EventFilterInput,
): Result<NormalizedEventFilters, EventError> {
  const normalizedQuery = (filters.q ?? "").trim().toLowerCase();
  const rawCategory = filters.category ?? "";
  const category = rawCategory.trim();
  const rawTimeframe = (filters.timeframe ?? "all").trim().toLowerCase();

  if (category.length > 50) {
    return Err(
      InvalidFilterValue("category", "Category filter must be 50 characters or fewer."),
    );
  }

  if (category.length > 0 && !/^[\w -]+$/.test(category)) {
    return Err(
      InvalidFilterValue(
        "category",
        "Category filter contains invalid characters.",
      ),
    );
  }

  if (rawTimeframe !== "all" && rawTimeframe !== "week" && rawTimeframe !== "weekend") {
    return Err(
      InvalidFilterValue(
        "timeframe",
        "Timeframe must be one of all, week, or weekend.",
      ),
    );
  }

  const timeframe: EventFilterTimeframe = rawTimeframe;

  return Ok({
    q: normalizedQuery,
    category: category.length > 0 ? category.toLowerCase() : null,
    timeframe,
  });
}

function getEndOfWeek(date: Date): Date {
  const endOfWeek = new Date(date);
  const daysUntilSunday = (7 - endOfWeek.getDay()) % 7;
  endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
  endOfWeek.setHours(23, 59, 59, 999);
  return endOfWeek;
}

function getWeekendRange(date: Date): { start: Date; end: Date } {
  const day = date.getDay();
  const start = new Date(date);

  if (day === 0) {
    start.setDate(start.getDate() - 1);
  } else {
    const daysUntilSaturday = (6 - day + 7) % 7;
    start.setDate(start.getDate() + daysUntilSaturday);
  }

  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  end.setHours(23, 59, 59, 999);

  return { start, end };
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
    filters: EventFilterInput,
  ): Promise<Result<IEventRecord[], EventError>> {
    void ctx;
    const normalizedFilters = normalizeEventFilters(filters);
    if (normalizedFilters.ok === false) {
      return Err(normalizedFilters.value);
    }

    const { q, category, timeframe } = normalizedFilters.value;
    const now = new Date();
    let startTimeFromIso: string | undefined;
    let startTimeToIso: string | undefined;

    if (timeframe === "week") {
      startTimeFromIso = now.toISOString();
      startTimeToIso = getEndOfWeek(now).toISOString();
    }

    if (timeframe === "weekend") {
      const weekend = getWeekendRange(now);
      startTimeFromIso = weekend.start.toISOString();
      startTimeToIso = weekend.end.toISOString();
    }

    const result = await this.events.findUpcomingPublished({
      nowIso: now.toISOString(),
      q,
      category: category ?? undefined,
      startTimeFromIso,
      startTimeToIso,
    });
    if (result.ok === false) {
      return Err(UnexpectedDependencyError(result.value.message));
    }

    return Ok(result.value);
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

      return Ok({
        rsvp: saveResult.value,
        outcome: "cancelled" as const,
        attendeeCount: countResult.value.length,
        event,               
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
      event
    });
  }

  async getRsvpState(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<RsvpStateResult, EventError>> {
    const existingResult = await this.rsvps.findByEventAndUser(eventId, ctx.userId);
    if (existingResult.ok === false) {
      return Err(UnexpectedDependencyError(existingResult.value.message));
    }
 
    const attendingResult = await this.rsvps.findAllByEvent(eventId, { status: "attending" });
    if (attendingResult.ok === false) {
      return Err(UnexpectedDependencyError(attendingResult.value.message));
    }
 
    const existing = existingResult.value;
    const outcome: RsvpStatus | null =
      existing && existing.status !== "cancelled" ? existing.status : null;
 
    return Ok({
      outcome,
      attendeeCount: attendingResult.value.length,
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
    async transitionExpiredEvents(ctx: SessionContext): Promise<Result<number, EventError>> {
    const allResult = await this.events.findAll();
    if (allResult.ok === false) {
      return Err(UnexpectedDependencyError(allResult.value.message));
    }

    const now = Date.now();
    let changed = 0;

    for (const event of allResult.value) {
      const isExpired =
        event.status === "published" &&
        new Date(event.endTime).getTime() <= now;

      if (!isExpired) continue;

      const updated: IEventRecord = {
        ...event,
        status: "concluded",
        updatedAt: new Date().toISOString(),
      };

      const saveResult = await this.events.save(updated);
      if (saveResult.ok === false) {
        return Err(UnexpectedDependencyError(saveResult.value.message));
      }

      changed++;
    }

    return Ok(changed);
  }
  async getArchivedEvents(ctx: SessionContext): Promise<Result<IEventRecord[], EventError>> {
    const transition = await this.transitionExpiredEvents(ctx);
    if (transition.ok === false) {
      return transition;
    }

    const allResult = await this.events.findAll();
    if (allResult.ok === false) {
      return Err(UnexpectedDependencyError(allResult.value.message));
    }

    const archived = allResult.value
      .filter((e) => e.status === "concluded")
      .sort(
        (a, b) =>
          new Date(b.endTime).getTime() - new Date(a.endTime).getTime(),
      );

    return Ok(archived);
  }
  async deleteEvent(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<boolean, EventError>> {
    if (ctx.role === "user") {
      return Err(Forbidden("Only staff and admins can delete events."));
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
      return Err(Forbidden("You do not have permission to delete this event."));
    }
    const deleteResult = await this.events.delete(eventId);
    if (deleteResult.ok === false) {
      return Err(UnexpectedDependencyError(deleteResult.value.message));
    }
    return Ok(true);
  }
}

export function CreateEventService(
  events: IEventRepository,
  rsvps: IRsvpRepository,
  users: IUserRepository,
): IEventService {
  return new EventService(events, rsvps, users);
}