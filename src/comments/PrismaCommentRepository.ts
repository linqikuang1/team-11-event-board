import type { PrismaClient } from "@prisma/client";
import { Err, Ok, type Result } from "../lib/result";
import type { ICommentRecord } from "./Comment";
import type { ICommentRepository } from "./CommentRepository";
import { UnexpectedDependencyError, type CommentError } from "./errors";

class PrismaCommentRepository implements ICommentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(comment: ICommentRecord): Promise<Result<ICommentRecord, CommentError>> {
    try {
      const created = await this.prisma.comment.create({
        data: {
          id: comment.id,
          eventId: comment.eventId,
          userId: comment.userId,
          content: comment.content,
          createdAt: new Date(comment.createdAt),
        },
      });
      return Ok({
        id: created.id,
        eventId: created.eventId,
        userId: created.userId,
        content: created.content,
        createdAt: created.createdAt.toISOString(),
      });
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the comment."));
    }
  }

  async findById(id: string): Promise<Result<ICommentRecord | null, CommentError>> {
    try {
      const found = await this.prisma.comment.findUnique({ where: { id } });
      if (!found) {
        return Ok(null);
      }
      return Ok({
        id: found.id,
        eventId: found.eventId,
        userId: found.userId,
        content: found.content,
        createdAt: found.createdAt.toISOString(),
      });
    } catch {
      return Err(UnexpectedDependencyError("Unable to find the comment."));
    }
  }

  async findByEventId(eventId: string): Promise<Result<ICommentRecord[], CommentError>> {
    try {
      const found = await this.prisma.comment.findMany({
        where: { eventId },
        orderBy: { createdAt: "asc" },
      });
      return Ok(
        found.map((c) => ({
          id: c.id,
          eventId: c.eventId,
          userId: c.userId,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
        })),
      );
    } catch {
      return Err(UnexpectedDependencyError("Unable to list comments."));
    }
  }

  async delete(id: string): Promise<Result<boolean, CommentError>> {
    try {
      const exists = await this.prisma.comment.findUnique({ where: { id }, select: { id: true } });
      if (!exists) {
        return Ok(false);
      }
      await this.prisma.comment.delete({ where: { id } });
      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to delete the comment."));
    }
  }
}

export function CreatePrismaCommentRepository(prisma: PrismaClient): ICommentRepository {
  return new PrismaCommentRepository(prisma);
}

