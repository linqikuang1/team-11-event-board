import type { Response } from "express";
import type { ISavedEventService } from "./SavedEventService";
import type { ILoggingService } from "../service/LoggingService";
import type { IAppBrowserSession } from "../session/AppSession";
import type { SessionContext } from "../events/EventService";
import type { SavedEventError } from "./errors";

export interface ISavedEventController {
  toggleSave(
    res: Response,
    eventId: string,
    session: IAppBrowserSession,
  ): Promise<void>;

  showSavedEvents(
    res: Response,
    session: IAppBrowserSession,
  ): Promise<void>;
}

class SavedEventController implements ISavedEventController {
  constructor(
    private readonly service: ISavedEventService,
    private readonly logger: ILoggingService,
  ) {}

  async toggleSave(
    res: Response,
    eventId: string,
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

    const result = await this.service.toggleSave(ctx, eventId);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      this.logger.warn(`Toggle save failed: ${error.message}`);
      res.status(status).render("partials/error", {
        message: error.message,
        layout: false,
      });
      return;
    }

    const action = result.value.saved ? "saved" : "unsaved";
    this.logger.info(`Event ${eventId} ${action} by user ${ctx.userId}`);
    res.redirect("/saved");
  }

  async showSavedEvents(
    res: Response,
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

    const result = await this.service.listSavedEvents(ctx);

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      this.logger.warn(`List saved events failed: ${error.message}`);
      res.status(status).render("partials/error", {
        message: error.message,
        layout: false,
      });
      return;
    }

    res.render("saved/list", {
      session,
      entries: result.value,
    });
  }

  private mapErrorStatus(error: SavedEventError): number {
    if (error.name === "Forbidden") return 403;
    if (error.name === "EventNotFound") return 404;
    if (error.name === "EventNotSaveable") return 400;
    if (error.name === "ValidationError") return 400;
    return 500;
  }
}

export function CreateSavedEventController(
  service: ISavedEventService,
  logger: ILoggingService,
): ISavedEventController {
  return new SavedEventController(service, logger);
}
