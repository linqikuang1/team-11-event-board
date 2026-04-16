import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type CommentError } from "./errors";
import type { ICommentRepository } from "./CommentRepository";
import type { ICommentRecord } from "./Comment";

class InMemoryCommentRepository implements ICommentRepository {
  private readonly comments: ICommentRecord[] = [];

  async save(comment: ICommentRecord): Promise<Result<ICommentRecord, CommentError>> {
    try {
      this.comments.push(comment);
      return Ok(comment);
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the comment."));
    }
  }

  async findById(id: string): Promise<Result<ICommentRecord | null, CommentError>> {
    try {
      const match = this.comments.find((c) => c.id === id) ?? null;
      return Ok(match);
    } catch {
      return Err(UnexpectedDependencyError("Unable to find the comment."));
    }
  }

  async findByEventId(eventId: string): Promise<Result<ICommentRecord[], CommentError>> {
    try {
      const results = this.comments
        .filter((c) => c.eventId === eventId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return Ok(results);
    } catch {
      return Err(UnexpectedDependencyError("Unable to list comments."));
    }
  }

  async delete(id: string): Promise<Result<boolean, CommentError>> {
    try {
      const index = this.comments.findIndex((c) => c.id === id);
      if (index === -1) {
        return Ok(false);
      }
      this.comments.splice(index, 1);
      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to delete the comment."));
    }
  }
}

export function CreateInMemoryCommentRepository(): ICommentRepository {
  return new InMemoryCommentRepository();
}
