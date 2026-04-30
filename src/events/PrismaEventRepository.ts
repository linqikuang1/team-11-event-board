import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type EventError } from "./errors";
import type { EventListQuery, IEventRepository } from "./EventRepository";
import type { IEventRecord, EventStatus } from "./Event";
import { Prisma, type PrismaClient, type Event as PrismaEvent } from "@prisma/client";

function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}

function deserializeTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toRecord(row: PrismaEvent): IEventRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status as EventStatus,
    organizerId: row.organizerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    capacity: row.capacity ?? null,
    tags: deserializeTags(row.tags),
  };
}

class PrismaEventRepository implements IEventRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(event: IEventRecord): Promise<Result<IEventRecord, EventError>> {
    try {
      const data = {
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        startTime: event.startTime,
        endTime: event.endTime,
        status: event.status,
        organizerId: event.organizerId,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        capacity: event.capacity ?? null,
        tags: serializeTags(event.tags),
      };

      const row = await this.db.event.upsert({
        where: { id: event.id },
        create: data,
        update: data,
      });

      return Ok(toRecord(row));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Err(UnexpectedDependencyError(`Unable to save the event: ${message}`));
    }
  }

  async findById(id: string): Promise<Result<IEventRecord | null, EventError>> {
    try {
      const row = await this.db.event.findUnique({ where: { id } });
      return Ok(row ? toRecord(row) : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Err(UnexpectedDependencyError(`Unable to find the event: ${message}`));
    }
  }

  async findAll(
    filter?: { status?: string; organizerId?: string },
  ): Promise<Result<IEventRecord[], EventError>> {
    try {
      const rows = await this.db.event.findMany({
        where: {
          ...(filter?.status ? { status: filter.status } : {}),
          ...(filter?.organizerId ? { organizerId: filter.organizerId } : {}),
        },
      });
      return Ok(rows.map(toRecord));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Err(UnexpectedDependencyError(`Unable to list events: ${message}`));
    }
  }

  async findUpcomingPublished(query: EventListQuery): Promise<Result<IEventRecord[], EventError>> {
    try {
      const where: Prisma.EventWhereInput = {
        status: "published",
        endTime: { gt: query.nowIso },
      };

      if (query.q && query.q.length > 0) {
        where.OR = [
          { title: { contains: query.q } },
          { description: { contains: query.q } },
          { location: { contains: query.q } },
        ];
      }

      if (query.category) {
        const normalizedCategory = query.category.trim().toLowerCase();
        const categoryJson = JSON.stringify([normalizedCategory]).slice(1, -1);
        where.tags = {
          contains: categoryJson,
        };
      }

      if (query.startTimeFromIso || query.startTimeToIso) {
        where.startTime = {
          ...(query.startTimeFromIso ? { gte: query.startTimeFromIso } : {}),
          ...(query.startTimeToIso ? { lte: query.startTimeToIso } : {}),
        };
      }

      const rows = await this.db.event.findMany({
        where,
        orderBy: [
          { startTime: "asc" },
          { title: "asc" },
        ],
      });

      return Ok(rows.map(toRecord));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Err(UnexpectedDependencyError(`Unable to list filtered events: ${message}`));
    }
  }

  async delete(id: string): Promise<Result<boolean, EventError>> {
    try {
      await this.db.event.delete({ where: { id } });
      return Ok(true);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2025"
      ) {
        return Ok(false);
      }
      const message = err instanceof Error ? err.message : String(err);
      return Err(UnexpectedDependencyError(`Unable to delete the event: ${message}`));
    }
  }
}

export function CreatePrismaEventRepository(db: PrismaClient): IEventRepository {
  return new PrismaEventRepository(db);
}