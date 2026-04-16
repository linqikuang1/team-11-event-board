import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type EventError } from "./errors";
import type { IRsvpRepository, IRsvpRecord, RsvpStatus } from "./RsvpRepository";

class InMemoryRsvpRepository implements IRsvpRepository {
  constructor(private readonly rsvps: IRsvpRecord[]) {}

  async save(rsvp: IRsvpRecord): Promise<Result<IRsvpRecord, EventError>> {
    try {
      const index = this.rsvps.findIndex(
        (r) => r.eventId === rsvp.eventId && r.userId === rsvp.userId,
      );
      if (index === -1) {
        this.rsvps.push(rsvp);
      } else {
        this.rsvps[index] = rsvp;
      }
      return Ok(rsvp);
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the RSVP."));
    }
  }

  async findByEventAndUser(
    eventId: string,
    userId: string,
  ): Promise<Result<IRsvpRecord | null, EventError>> {
    try {
      const match =
        this.rsvps.find((r) => r.eventId === eventId && r.userId === userId) ?? null;
      return Ok(match);
    } catch {
      return Err(UnexpectedDependencyError("Unable to find the RSVP."));
    }
  }

  async findAllByEvent(
    eventId: string,
    filter?: { status?: RsvpStatus },
  ): Promise<Result<IRsvpRecord[], EventError>> {
    try {
      let results = this.rsvps.filter((r) => r.eventId === eventId);
      if (filter?.status) {
        results = results.filter((r) => r.status === filter.status);
      }
      return Ok(results);
    } catch {
      return Err(UnexpectedDependencyError("Unable to list RSVPs."));
    }
  }
}

export function CreateInMemoryRsvpRepository(): IRsvpRepository {
  return new InMemoryRsvpRepository([]);
}