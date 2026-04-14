import type { Result } from "../lib/result";
import type { CommentError } from "./errors";
import type { ICommentRecord } from "./Comment";

export interface ICommentRepository {
  save(comment: ICommentRecord): Promise<Result<ICommentRecord, CommentError>>;
  findById(id: string): Promise<Result<ICommentRecord | null, CommentError>>;
  findByEventId(eventId: string): Promise<Result<ICommentRecord[], CommentError>>;
  delete(id: string): Promise<Result<boolean, CommentError>>;
}
