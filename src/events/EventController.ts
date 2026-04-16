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
  showArchivePage(res: Response, session: IAppBrowserSession): Promise<void>;
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
    return 500;
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
    res.redirect("/events");
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
    async showArchivePage(
    res: Response,
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

    const result = await this.service.getArchivedEvents(ctx);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Show archive failed: ${error.message}`);

      res.status(status).render("events/archive", {
        session,
        events: [],
        pageError: error.message,
      });
      return;
    }

    res.render("events/archive", {
      session,
      events: result.value,
      pageError: null,
    });
  }
}

export function CreateEventController(
  service: IEventService,
  logger: ILoggingService,
): IEventController {
  return new EventController(service, logger);
}