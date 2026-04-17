import type { Response } from "express";
import type { IEventService, CreateEventInput, UpdateEventInput, SessionContext } from "./EventService";
import type { IAppBrowserSession, AppSessionStore } from "../session/AppSession";
import { touchAppSession } from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import type { EventError } from "./errors";

export interface IEventController {
  showCreateForm(res: Response, session: IAppBrowserSession, pageError?: string | null): Promise<void>;
  createFromForm(res: Response, input: CreateEventInput, store: AppSessionStore): Promise<void>;
  showEditForm(res: Response, eventId: string, session: IAppBrowserSession, pageError?: string | null): Promise<void>;
  updateFromForm(res: Response, eventId: string, input: UpdateEventInput, store: AppSessionStore): Promise<void>;
  showEventsPage(res: Response, session: IAppBrowserSession, query?: string, successMessage?: string | null): Promise<void>;
  searchEventsPartial(res: Response, query: string, store: AppSessionStore): Promise<void>;
  publishEvent(res: Response, eventId: string, store: AppSessionStore): Promise<void>;
  cancelEvent(res: Response, eventId: string, store: AppSessionStore): Promise<void>;
  showEventDetail(res: Response, eventId: string, session: IAppBrowserSession): Promise<void>;
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
    if (error.name === "InvalidTransition") return 409;
    return 500;
  }

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

    private buildSessionContext(session: IAppBrowserSession): SessionContext | null {
    const user = session.authenticatedUser;

    if (!user) {
      return null;
    }

    return {
      userId: user.userId,
      role: user.role as SessionContext["role"],
    };
  }

  async showCreateForm(
    res: Response,
    session: IAppBrowserSession,
    pageError: string | null = null,
  ): Promise<void> {
    res.render("events/create", { pageError, session });
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
    res.redirect("/events?success=Event+created+successfully");
  }

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

  async showEditForm(
    res: Response,
    eventId: string,
    session: IAppBrowserSession,
    pageError: string | null = null,
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

    const result = await this.service.getEventById(ctx, eventId);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      this.logger.warn(`Show edit form failed: ${error.message}`);
      res.status(status).render("partials/error", {
        message: error.message,
        layout: false,
      });
      return;
    }

    res.render("events/edit", { pageError, session, event: result.value });
  }

  async updateFromForm(
    res: Response,
    eventId: string,
    input: UpdateEventInput,
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

    const result = await this.service.updateEvent(ctx, eventId, input);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Update event failed: ${error.message}`);
      res.status(status);
      await this.showEditForm(res, eventId, session, error.message);
      return;
    }

    this.logger.info(`Updated event ${result.value.id}`);
    res.redirect(`/events/${eventId}`);
  }
    async showEventsPage(
    res: Response,
    session: IAppBrowserSession,
    query: string = "",
    successMessage: string | null = null,
  ): Promise<void> {
    const ctx = this.buildSessionContext(session);

    if (!ctx) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const result = await this.service.searchEvents(ctx, query);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Show events failed: ${error.message}`);

      res.status(status).render("events/index", {
        session,
        query,
        events: [],
        pageError: error.message,
        successMessage : successMessage ?? null,
      });
      return;
    }

    res.render("events/index", {
      session,
      query,
      events: result.value,
      pageError: null,
      successMessage,
    });
  }

  async searchEventsPartial(
    res: Response,
    query: string,
    store: AppSessionStore,
  ): Promise<void> {
    const session = touchAppSession(store);
    const ctx = this.buildSessionContext(session);

    if (!ctx) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const result = await this.service.searchEvents(ctx, query);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Search events failed: ${error.message}`);

      res.status(status).render("events/partials/list", {
        events: [],
        layout: false,
      });
      return;
    }

    res.render("events/partials/list", {
      events: result.value,
      layout: false,
    });
  }

  /**
   * POST /events/:id/publish
   *
   * Transitions a draft event to published. Responds with JSON on success so
   * the page can update the status badge and action buttons inline.
   *
   * Response shape on success:
   *   { status: "published" }
   */
  async publishEvent(
    res: Response,
    eventId: string,
    store: AppSessionStore,
  ): Promise<void> {
    const ctx = this.resolveContext(store);
    if (!ctx) {
      this.renderPartialError(res, 401, "Please log in to continue.");
      return;
    }
 
    const result = await this.service.publishEvent(ctx, eventId);
 
    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Publish event ${eventId} failed: ${error.message}`);
      this.renderPartialError(res, status, error.message);
      return;
    }
 
    this.logger.info(`Event ${eventId} published by user ${ctx.userId}`);
    res.redirect(`/events/${eventId}`);
  }
 
  /**
   * POST /events/:id/cancel
   *
   * Permanently cancels a published event. Responds with JSON on success.
   *
   * Response shape on success:
   *   { status: "cancelled" }
   */
  async cancelEvent(
    res: Response,
    eventId: string,
    store: AppSessionStore,
  ): Promise<void> {
    const ctx = this.resolveContext(store);
    if (!ctx) {
      this.renderPartialError(res, 401, "Please log in to continue.");
      return;
    }
 
    const result = await this.service.cancelEvent(ctx, eventId);
 
    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Cancel event ${eventId} failed: ${error.message}`);
      this.renderPartialError(res, status, error.message);
      return;
    }
 
    this.logger.info(`Event ${eventId} cancelled by user ${ctx.userId}`);
    res.redirect(`/events/${eventId}`);
  }

  async showEventDetail(
    res: Response,
    eventId: string,
    session: IAppBrowserSession,
  ): Promise<void> {
    const ctx = this.buildSessionContext(session);
    if (!ctx) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }
    const result = await this.service.getEventById(ctx, eventId);
    
    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      this.logger.warn(`Show event detail failed: ${error.message}`);
      res.status(status).render("partials/error", {
        message: error.message,
        layout: false,
      });
      return;
    }

    this.logger.info(`GET /events/${eventId} for ${ctx.userId}`);
    res.render("events/show", { session, event: result.value });
  }
}

export function CreateEventController(
  service: IEventService,
  logger: ILoggingService,
): IEventController {
  return new EventController(service, logger);
}