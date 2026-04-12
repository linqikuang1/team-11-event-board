import { type Result } from "../lib/result";
import { type EventError } from "./errors";
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
