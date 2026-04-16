import type { Response } from "express";
import type { IEventService, CreateEventInput, SessionContext } from "./EventService";
import type { IAppBrowserSession, AppSessionStore } from "../session/AppSession";
import { touchAppSession } from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import type { EventError } from "./errors";

export interface IEventController {
  showCreateForm(res: Response, session: IAppBrowserSession, pageError?: string | null): Promise<void>;
  createFromForm(res: Response, input: CreateEventInput, store: AppSessionStore): Promise<void>;
  toggleRsvp(res: Response, eventId: string, store: AppSessionStore): Promise<void>;
  
}

class EventController implements IEventController {
  constructor(
    private readonly service: IEventService,
    private readonly logger: ILoggingService,
  ) {}

  private mapErrorStatus(error: EventError): number {
    if (error.name === "Forbidden") return 403;
    if (error.name === "EventNotFound") return 404;
    if (error.name === "ValidationError") return 400;
    if (error.name === "UneditableStatus") return 409;
    if (error.name === "EventFull") return 409;
    
    return 500;
  }

  async showCreateForm(
    res: Response,
    session: IAppBrowserSession,
    pageError: string | null = null,
  ): Promise<void> {
    res.render("events/create", { pageError, session });
  }

  /** Render a self-contained error partial (no layout) for HTMX swaps. */
  private renderPartialError(res: Response, status: number, message: string): void {
    res.status(status).render("partials/error", { message, layout: false });
  }
 
  /** Extract and validate the authenticated user from the session. */
  private resolveContext(store: AppSessionStore): SessionContext | null {
    const user = touchAppSession(store).authenticatedUser;
    if (!user) return null;
    return {
      userId: user.userId,
      role: user.role as SessionContext["role"],
    };
  }

  async createFromForm(
    res: Response,
    input: CreateEventInput,
    store: AppSessionStore,
  ): Promise<void> {
    const session = touchAppSession(store);
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

    const result = await this.service.createEvent(ctx, input);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Create event failed: ${error.message}`);
      res.status(status);
      await this.showCreateForm(res, session, error.message);
      return;
    }

    this.logger.info(`Created event ${result.value.id}`);
    res.redirect("/events");
  }

  // ── Feature 4: RSVP toggle ────────────────────────────────────────────────
 
  /**
   * POST /events/:id/rsvp
   *
   * Responds with a JSON payload so the client can update the button and
   * attendee count inline (HTMX or fetch). On error, renders the shared
   * partials/error partial so HTMX can swap it in.
   *
   * Response shape on success:
   *   { outcome: "attending" | "waitlisted" | "cancelled", attendeeCount: number }
   */
  async toggleRsvp(
    res: Response,
    eventId: string,
    store: AppSessionStore,
  ): Promise<void> {
    const ctx = this.resolveContext(store);
    if (!ctx) {
      this.renderPartialError(res, 401, "Please log in to continue.");
      return;
    }
 
    const result = await this.service.toggleRsvp(ctx, eventId);
 
    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Toggle RSVP failed for event ${eventId}: ${error.message}`);
      this.renderPartialError(res, status, error.message);
      return;
    }
 
    const { outcome, attendeeCount } = result.value;
    this.logger.info(
      `User ${ctx.userId} toggled RSVP on event ${eventId}: ${outcome}`,
    );
    res.status(200).json({ outcome, attendeeCount });
  }
}

export function CreateEventController(
  service: IEventService,
  logger: ILoggingService,
): IEventController {
  return new EventController(service, logger);
}