import type { Response } from "express";
import type {
  IEventService,
  CreateEventInput,
  UpdateEventInput,
  SessionContext,
  EventFilterInput,
} from "./EventService";
import type { ISavedEventService } from "../saved/SavedEventService";
import type { IAppBrowserSession, AppSessionStore } from "../session/AppSession";
import { touchAppSession } from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import type { EventError } from "./errors";

export interface IEventController {
  showCreateForm(res: Response, session: IAppBrowserSession, pageError?: string | null): Promise<void>;
  createFromForm(res: Response, input: CreateEventInput, store: AppSessionStore): Promise<void>;
  toggleRsvp(res: Response, eventId: string, store: AppSessionStore): Promise<void>;
  showEditForm(res: Response, eventId: string, session: IAppBrowserSession, pageError?: string | null): Promise<void>;
  updateFromForm(res: Response, eventId: string, input: UpdateEventInput, store: AppSessionStore): Promise<void>;
  showEventsPage(
    res: Response,
    session: IAppBrowserSession,
    filters?: EventFilterInput,
    successMessage?: string | null,
  ): Promise<void>;
  searchEventsPartial(res: Response, filters: EventFilterInput, store: AppSessionStore): Promise<void>;
  publishEvent(res: Response, eventId: string, store: AppSessionStore): Promise<void>;
  cancelEvent(res: Response, eventId: string, store: AppSessionStore): Promise<void>;
  showEventDetail(res: Response, eventId: string, session: IAppBrowserSession): Promise<void>;
  showAttendeeList(
    res: Response,
    eventId: string,
    session: IAppBrowserSession,
    isHtmxRequest?: boolean,
  ): Promise<void>;
  showArchivePage(
  res: Response,
  session: IAppBrowserSession,
  category?: string,
): Promise<void>;
  showArchivePartial(
    res: Response,
    session: IAppBrowserSession,
    category?: string,
  ): Promise<void>;
}

class EventController implements IEventController {
  constructor(
    private readonly service: IEventService,
    private readonly savedEvents: ISavedEventService,
    private readonly logger: ILoggingService,
  ) {}

  private mapErrorStatus(error: EventError): number {
    if (error.name === "Forbidden") return 403;
    if (error.name === "EventNotFound") return 404;
    if (error.name === "ValidationError") return 400;
    if (error.name === "InvalidFilterValue") return 400;
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
 
    const { outcome, attendeeCount, event } = result.value;
    this.logger.info(`User ${ctx.userId} toggled RSVP on event ${eventId}: ${outcome}`);
 
    const isPast  = new Date(event.startTime) <= new Date();
    const canRsvp = event.status === "published" && !isPast;
 
    res.status(200).render("events/partials/rsvp_button", {
      layout: false,
      eventId,
      outcome,
      attendeeCount,
      capacity: event.capacity,
      readonly: !canRsvp,
    });
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
    filters: EventFilterInput = {},
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

    const result = await this.service.searchEvents(ctx, filters);
    const allEventsResult = await this.service.searchEvents(ctx, { timeframe: "all" });

    const q = filters.q ?? "";
    const category = filters.category ?? "";
    const timeframe = filters.timeframe ?? "all";
    const availableCategories =
      allEventsResult.ok === true
        ? [...new Set(allEventsResult.value.flatMap((event) => event.tags))]
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
            .sort((a, b) => a.localeCompare(b))
        : [];

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Show events failed: ${error.message}`);

      res.status(status).render("events/index", {
        session,
        q,
        category,
        timeframe,
        availableCategories,
        events: [],
        pageError: error.message,
        successMessage : successMessage ?? null,
      });
      return;
    }

    res.render("events/index", {
      session,
      q,
      category,
      timeframe,
      availableCategories,
      events: result.value,
      pageError: null,
      successMessage,
    });
  }

  async searchEventsPartial(
    res: Response,
    filters: EventFilterInput,
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

    const result = await this.service.searchEvents(ctx, filters);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Search events failed: ${error.message}`);

      res.status(status).render("partials/list", {
        events: [],
        layout: false,
      });
      return;
    }

    res.render("partials/list", {
      events: result.value,
      layout: false,
    });
  }

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
 
    res.status(200).render("events/partials/event_controls", {
      layout: false,
      event: result.value,
    });
  }
 
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
 
    res.status(200).render("events/partials/event_controls", {
      layout: false,
      event: result.value,
    });
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
    let isSaved = false;
    if (ctx.role === "user") {
      const savedResult = await this.savedEvents.isEventSaved(ctx, eventId);
      if (savedResult.ok === false) {
        this.logger.warn(`Saved status lookup failed: ${savedResult.value.message}`);
        res.status(500).render("partials/error", {
          message: savedResult.value.message,
          layout: false,
        });
        return;
      }
      isSaved = savedResult.value;
    }

    res.render("events/show", { session, event: result.value, isSaved });
  }

  async showAttendeeList(
    res: Response,
    eventId: string,
    session: IAppBrowserSession,
    isHtmxRequest = false,
  ): Promise<void> {
    const ctx = this.buildSessionContext(session);
    if (!ctx) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const result = await this.service.listAttendees(ctx, eventId);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Show attendee list failed: ${error.message}`);
      res.status(status).render("partials/error", {
        message: error.message,
        layout: false,
      });
      return;
    }

    this.logger.info(`GET /events/${eventId}/attendees for ${ctx.userId}`);
    if (isHtmxRequest) {
      res.render("events/partials/attendee-list", {
        attendeeGroups: {
          attending: result.value.attending,
          waitlisted: result.value.waitlisted,
          cancelled: result.value.cancelled,
        },
        layout: false,
      });
      return;
    }

    res.render("events/attendees", {
      session,
      event: result.value.event,
      attendeeGroups: {
        attending: result.value.attending,
        waitlisted: result.value.waitlisted,
        cancelled: result.value.cancelled,
      },
    });
  }
   async showArchivePage(
  res: Response,
  session: IAppBrowserSession,
  category: string = "",
): Promise<void> {
    const ctx = this.buildSessionContext(session);

    if (!ctx) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const result = await this.service.getArchivedEvents(ctx, category);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Show archive failed: ${error.message}`);

      res.status(status).render("events/archive", {
        session,
        events: [],
        pageError: error.message,
        category,
        availableCategories: [],
      });
      return;
    }

    const allArchived = await this.service.getArchivedEvents(ctx);
    const availableCategories =
      allArchived.ok === true
        ? [...new Set(allArchived.value.flatMap((event) => event.tags))]
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
            .sort((a, b) => a.localeCompare(b))
        : [];

    res.render("events/archive", {
      session,
      events: result.value,
      pageError: null,
      category,
      availableCategories,
    });
  }
    async showArchivePartial(
    res: Response,
    session: IAppBrowserSession,
    category: string = "",
  ): Promise<void> {
    const ctx = this.buildSessionContext(session);

    if (!ctx) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const result = await this.service.getArchivedEvents(ctx, category);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Show archive partial failed: ${error.message}`);

      res.status(status).render("events/partials/archive_list", {
        events: [],
        layout: false,
      });
      return;
    }

    res.render("events/partials/archive_list", {
      events: result.value,
      layout: false,
    });
  }
}

export function CreateEventController(
  service: IEventService,
  savedEvents: ISavedEventService,
  logger: ILoggingService,
): IEventController {
  return new EventController(service, savedEvents, logger);
}