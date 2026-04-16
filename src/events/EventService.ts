import { Err, Ok, type Result } from "../lib/result";
import {
  Forbidden,
  EventNotFound,
  ValidationError,
  UneditableStatus,
  UnexpectedDependencyError,
  type EventError,
} from "./errors";
import { type IEventRepository } from "./EventRepository";
import { type IEventRecord } from "./Event";

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
  role: "organizer" | "admin" | "member";
}

export interface IEventService {
  createEvent(ctx: SessionContext, input: CreateEventInput): Promise<Result<IEventRecord, EventError>>;
  updateEvent(ctx: SessionContext, eventId: string, input: UpdateEventInput): Promise<Result<IEventRecord, EventError>>;
  searchEvents(ctx: SessionContext, query: string): Promise<Result<IEventRecord[], EventError>>;
}

function validateEventInput(input: CreateEventInput | UpdateEventInput): Record<string, string> | null {
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
    const start = new Date(input.startTime);
    if (isNaN(start.getTime())) {
      fields.startTime = "Start time must be a valid date.";
    } else if (start <= new Date()) {
      fields.startTime = "Start time must be in the future.";
    }
  }

  if ("endTime" in input && input.endTime !== undefined) {
    const end = new Date(input.endTime);
    if (isNaN(end.getTime())) {
      fields.endTime = "End time must be a valid date.";
    } else if ("startTime" in input && input.startTime) {
      const start = new Date(input.startTime);
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
  constructor(private readonly events: IEventRepository) {}

  async createEvent(ctx: SessionContext, input: CreateEventInput): Promise<Result<IEventRecord, EventError>> {
    if (ctx.role === "member") {
      return Err(Forbidden("Members cannot create events."));
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

  async updateEvent(ctx: SessionContext, eventId: string, input: UpdateEventInput): Promise<Result<IEventRecord, EventError>> {
    if (ctx.role === "member") {
      return Err(Forbidden("Members cannot edit events."));
    }

    const findResult = await this.events.findById(eventId);
    if (findResult.ok === false) {
      return Err(UnexpectedDependencyError(findResult.value.message));
    }

    if (!findResult.value) {
      return Err(EventNotFound("Event not found."));
    }

    const event = findResult.value;

    if (ctx.role === "organizer" && event.organizerId !== ctx.userId) {
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

  async searchEvents(ctx: SessionContext, query: string): Promise<Result<IEventRecord[], EventError>> {
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
}

export function CreateEventService(events: IEventRepository): IEventService {
  return new EventService(events);
}