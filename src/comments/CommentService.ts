import { Err, Ok, type Result } from "../lib/result";
import {
  CommentNotFound,
  EventNotFound,
  EventNotPublished,
  Forbidden,
  ValidationError,
  UnexpectedDependencyError,
  type CommentError,
} from "./errors";
import type { ICommentRepository } from "./CommentRepository";
import type { ICommentRecord } from "./Comment";
import type { IEventRepository } from "../events/EventRepository";
import type { SessionContext } from "../events/EventService";

export interface ICommentService {
  addComment(
    ctx: SessionContext,
    input: { eventId: string; content: string },
  ): Promise<Result<ICommentRecord, CommentError>>;

  deleteComment(
    ctx: SessionContext,
    commentId: string,
    eventId: string,
  ): Promise<Result<void, CommentError>>;

  listComments(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<ICommentRecord[], CommentError>>;
}

class CommentService implements ICommentService {
  constructor(
    private readonly comments: ICommentRepository,
    private readonly events: IEventRepository,
  ) {}

  async addComment(
    ctx: SessionContext,
    input: { eventId: string; content: string },
  ): Promise<Result<ICommentRecord, CommentError>> {
    const content = input.content.trim();

    if (!content || content.length === 0) {
      return Err(ValidationError("Invalid comment input.", { content: "Content is required." }));
    }

    if (content.length > 500) {
      return Err(ValidationError("Invalid comment input.", { content: "Content must be 500 characters or fewer." }));
    }

    const eventResult = await this.events.findById(input.eventId);
    if (eventResult.ok === false) {
      return Err(UnexpectedDependencyError(eventResult.value.message));
    }

    if (!eventResult.value) {
      return Err(EventNotFound("Event not found."));
    }

    if (eventResult.value.status !== "published") {
      return Err(EventNotPublished("Comments are only allowed on published events."));
    }

    const comment: ICommentRecord = {
      id: crypto.randomUUID(),
      eventId: input.eventId,
      userId: ctx.userId,
      content,
      createdAt: new Date().toISOString(),
    };

    const saveResult = await this.comments.save(comment);
    if (saveResult.ok === false) {
      return Err(UnexpectedDependencyError(saveResult.value.message));
    }

    return Ok(saveResult.value);
  }

  async deleteComment(
    ctx: SessionContext,
    commentId: string,
    eventId: string,
  ): Promise<Result<void, CommentError>> {
    const commentResult = await this.comments.findById(commentId);
    if (commentResult.ok === false) {
      return Err(UnexpectedDependencyError(commentResult.value.message));
    }

    if (!commentResult.value) {
      return Err(CommentNotFound("Comment not found."));
    }

    const comment = commentResult.value;

    const isAuthor = comment.userId === ctx.userId;
    const isAdmin = ctx.role === "admin";

    let isEventOrganizer = false;
    if (!isAuthor && !isAdmin) {
      const eventResult = await this.events.findById(eventId);
      if (eventResult.ok === false) {
        return Err(UnexpectedDependencyError(eventResult.value.message));
      }
      if (eventResult.value) {
        isEventOrganizer = eventResult.value.organizerId === ctx.userId;
      }
    }

    if (!isAuthor && !isAdmin && !isEventOrganizer) {
      return Err(Forbidden("You do not have permission to delete this comment."));
    }

    const deleteResult = await this.comments.delete(commentId);
    if (deleteResult.ok === false) {
      return Err(UnexpectedDependencyError(deleteResult.value.message));
    }

    return Ok(undefined);
  }

  async listComments(
    _ctx: SessionContext,
    eventId: string,
  ): Promise<Result<ICommentRecord[], CommentError>> {
    const eventResult = await this.events.findById(eventId);
    if (eventResult.ok === false) {
      return Err(UnexpectedDependencyError(eventResult.value.message));
    }

    if (!eventResult.value) {
      return Err(EventNotFound("Event not found."));
    }

    const commentsResult = await this.comments.findByEventId(eventId);
    if (commentsResult.ok === false) {
      return Err(UnexpectedDependencyError(commentsResult.value.message));
    }

    return Ok(commentsResult.value);
  }
}

export function CreateCommentService(
  comments: ICommentRepository,
  events: IEventRepository,
): ICommentService {
  return new CommentService(comments, events);
}
