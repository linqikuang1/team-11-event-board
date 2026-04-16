import type { Result } from "../lib/result";
import type { EventError } from "./errors";

export type RsvpStatus = "attending" | "waitlisted" | "cancelled";

export interface IRsvpRecord {
  eventId: string;
  userId: string;
  status: RsvpStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IRsvpRepository {
  /**
   * Method that upserts an RSVP record. If one already exists for (eventId, userId) entry, it is
   * replaced wholesale; otherwise a new record is inserted.
   */
  save(rsvp: IRsvpRecord): Promise<Result<IRsvpRecord, EventError>>;

  /** Returns null when no RSVP exists for this (eventId, userId) pair. */
  findByEventAndUser(
    eventId: string,
    userId: string,
  ): Promise<Result<IRsvpRecord | null, EventError>>;

  /** All RSVPs for an event, optionally filtered by status. */
  findAllByEvent(
    eventId: string,
    filter?: { status?: RsvpStatus },
  ): Promise<Result<IRsvpRecord[], EventError>>;
}