import type { PrismaClient, Rsvp as PrismaRsvp } from "@prisma/client";
import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type EventError } from "./errors";
import type { IRsvpRepository, IRsvpRecord, RsvpStatus } from "./RsvpRepository";

function toRecord(row: PrismaRsvp): IRsvpRecord {
  return {
    eventId: row.eventId,
    userId: row.userId,
    status: row.status as RsvpStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

class PrismaRsvpRepository implements IRsvpRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(rsvp: IRsvpRecord): Promise<Result<IRsvpRecord, EventError>> {
    try {
      const data = {
        eventId: rsvp.eventId,
        userId: rsvp.userId,
        status: rsvp.status,
        createdAt: rsvp.createdAt,
        updatedAt: rsvp.updatedAt,
      };

      const row = await this.db.rsvp.upsert({
        where: {
          eventId_userId: {
            eventId: rsvp.eventId,
            userId: rsvp.userId,
          },
        },
        create: data,
        update: {
          status: data.status,
          updatedAt: data.updatedAt,
        },
      });

      return Ok(toRecord(row));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Err(UnexpectedDependencyError(`Unable to save the RSVP: ${message}`));
    }
  }

  async findByEventAndUser(
    eventId: string,
    userId: string,
  ): Promise<Result<IRsvpRecord | null, EventError>> {
    try {
      const row = await this.db.rsvp.findUnique({
        where: {
          eventId_userId: { eventId, userId },
        },
      });
      return Ok(row ? toRecord(row) : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Err(UnexpectedDependencyError(`Unable to find the RSVP: ${message}`));
    }
  }

  async findAllByEvent(
    eventId: string,
    filter?: { status?: RsvpStatus },
  ): Promise<Result<IRsvpRecord[], EventError>> {
    try {
      const rows = await this.db.rsvp.findMany({
        where: {
          eventId,
          ...(filter?.status ? { status: filter.status } : {}),
        },
      });
      return Ok(rows.map(toRecord));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Err(UnexpectedDependencyError(`Unable to list RSVPs: ${message}`));
    }
  }

  async countByEvent(
    eventId: string,
    filter?: { status?: RsvpStatus },
  ): Promise<Result<number, EventError>> {
    try {
      const count = await this.db.rsvp.count({
        where: {
          eventId,
          ...(filter?.status ? { status: filter.status } : {}),
        },
      });
      return Ok(count);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Err(UnexpectedDependencyError(`Unable to count RSVPs: ${message}`));
    }
  }
}

export function CreatePrismaRsvpRepository(db: PrismaClient): IRsvpRepository {
  return new PrismaRsvpRepository(db);
}
