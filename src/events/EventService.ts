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