import type { Response } from "express";
import type { ICommentService } from "./CommentService";
import type { ILoggingService } from "../service/LoggingService";
import type { IAppBrowserSession } from "../session/AppSession";
import type { SessionContext } from "../events/EventService";
import type { CommentError } from "./errors";

export interface ICommentController {
  postComment(
    res: Response,
    eventId: string,
    content: string,
    session: IAppBrowserSession,
  ): Promise<void>;

  deleteComment(
    res: Response,
    eventId: string,
    commentId: string,
    session: IAppBrowserSession,
  ): Promise<void>;
}

class CommentController implements ICommentController {
  constructor(
    private readonly service: ICommentService,
    private readonly logger: ILoggingService,
  ) {}

  private mapErrorStatus(error: CommentError): number {
    if (error.name === "ValidationError") return 400;
    if (error.name === "Forbidden") return 403;
    if (error.name === "CommentNotFound") return 404;
    if (error.name === "EventNotFound") return 404;
    if (error.name === "EventNotPublished") return 403;
    return 500;
  }

  async postComment(
    res: Response,
    eventId: string,
    content: string,
    session: IAppBrowserSession,
  ): Promise<void> {
    const user = session.authenticatedUser;

    if (!user) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const ctx: SessionContext = {
      userId: user.userId,
      role: user.role as SessionContext["role"],
    };

    const result = await this.service.addComment(ctx, { eventId, content });

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Post comment failed: ${error.message}`);
      res.status(status).render("partials/error", {
        message: error.message,
        layout: false,
      });
      return;
    }

    this.logger.info(`Comment ${result.value.id} posted on event ${eventId}`);
    res.redirect(`/events/${eventId}`);
  }

  async deleteComment(
    res: Response,
    eventId: string,
    commentId: string,
    session: IAppBrowserSession,
  ): Promise<void> {
    const user = session.authenticatedUser;

    if (!user) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const ctx: SessionContext = {
      userId: user.userId,
      role: user.role as SessionContext["role"],
    };

    const result = await this.service.deleteComment(ctx, commentId, eventId);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Delete comment failed: ${error.message}`);
      res.status(status).render("partials/error", {
        message: error.message,
        layout: false,
      });
      return;
    }

    this.logger.info(`Comment ${commentId} deleted from event ${eventId}`);
    res.redirect(`/events/${eventId}`);
  }
}

export function CreateCommentController(
  service: ICommentService,
  logger: ILoggingService,
): ICommentController {
  return new CommentController(service, logger);
}
