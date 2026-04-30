import type { PrismaClient } from "@prisma/client";
import { Err, Ok, type Result } from "../lib/result";
import type { ISavedEventRecord } from "./SavedEvent";
import type { ISavedEventRepository } from "./SavedEventRepository";
import { UnexpectedDependencyError, type SavedEventError } from "./errors";

class PrismaSavedEventRepository implements ISavedEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(savedEvent: ISavedEventRecord): Promise<Result<ISavedEventRecord, SavedEventError>> {
    try {
      const created = await this.prisma.savedEvent.create({
        data: {
          id: savedEvent.id,
          eventId: savedEvent.eventId,
          userId: savedEvent.userId,
          savedAt: new Date(savedEvent.savedAt),
        },
      });
      return Ok({
        id: created.id,
        eventId: created.eventId,
        userId: created.userId,
        savedAt: created.savedAt.toISOString(),
      });
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the bookmark."));
    }
  }

  async findByUserAndEvent(
    userId: string,
    eventId: string,
  ): Promise<Result<ISavedEventRecord | null, SavedEventError>> {
    try {
      const found = await this.prisma.savedEvent.findUnique({
        where: { userId_eventId: { userId, eventId } },
      });
      if (!found) {
        return Ok(null);
      }
      return Ok({
        id: found.id,
        eventId: found.eventId,
        userId: found.userId,
        savedAt: found.savedAt.toISOString(),
      });
    } catch {
      return Err(UnexpectedDependencyError("Unable to find the bookmark."));
    }
  }

  async findByUserId(userId: string): Promise<Result<ISavedEventRecord[], SavedEventError>> {
    try {
      const found = await this.prisma.savedEvent.findMany({
        where: { userId },
        orderBy: { savedAt: "desc" },
      });
      return Ok(
        found.map((s) => ({
          id: s.id,
          eventId: s.eventId,
          userId: s.userId,
          savedAt: s.savedAt.toISOString(),
        })),
      );
    } catch {
      return Err(UnexpectedDependencyError("Unable to list bookmarks."));
    }
  }

  async delete(id: string): Promise<Result<boolean, SavedEventError>> {
    try {
      const exists = await this.prisma.savedEvent.findUnique({ where: { id }, select: { id: true } });
      if (!exists) {
        return Ok(false);
      }
      await this.prisma.savedEvent.delete({ where: { id } });
      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to delete the bookmark."));
    }
  }
}

export function CreatePrismaSavedEventRepository(prisma: PrismaClient): ISavedEventRepository {
  return new PrismaSavedEventRepository(prisma);
}

