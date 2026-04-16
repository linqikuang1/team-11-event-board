import { Err, Ok, type Result } from "../lib/result";
import {
  EventNotFound,
  EventNotSaveable,
  Forbidden,
  UnexpectedDependencyError,
  type SavedEventError,
} from "./errors";
import type { ISavedEventRepository } from "./SavedEventRepository";
import type { ISavedEventRecord } from "./SavedEvent";
import type { IEventRepository } from "../events/EventRepository";
import type { IEventRecord } from "../events/Event";
import type { SessionContext } from "../events/EventService";

export interface ISavedEventService {
  toggleSave(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<{ saved: boolean }, SavedEventError>>;

  listSavedEvents(
    ctx: SessionContext,
  ): Promise<Result<{ savedEvent: ISavedEventRecord; event: IEventRecord }[], SavedEventError>>;

  isEventSaved(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<boolean, SavedEventError>>;
}

class SavedEventService implements ISavedEventService {
  constructor(
    private readonly savedEvents: ISavedEventRepository,
    private readonly events: IEventRepository,
  ) {}

  async toggleSave(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<{ saved: boolean }, SavedEventError>> {
    if (ctx.role !== "user") {
      return Err(Forbidden("Only members can save events."));
    }

    const eventResult = await this.events.findById(eventId);
    if (eventResult.ok === false) {
      return Err(UnexpectedDependencyError(eventResult.value.message));
    }

    if (!eventResult.value) {
      return Err(EventNotFound("Event not found."));
    }

    const status = eventResult.value.status;
    if (status === "cancelled" || status === "concluded") {
      return Err(EventNotSaveable(`Cannot save an event that is ${status}.`));
    }

    const existingResult = await this.savedEvents.findByUserAndEvent(ctx.userId, eventId);
    if (existingResult.ok === false) {
      return Err(UnexpectedDependencyError(existingResult.value.message));
    }

    if (existingResult.value) {
      const deleteResult = await this.savedEvents.delete(existingResult.value.id);
      if (deleteResult.ok === false) {
        return Err(UnexpectedDependencyError(deleteResult.value.message));
      }
      return Ok({ saved: false });
    }

    const savedEvent: ISavedEventRecord = {
      id: crypto.randomUUID(),
      eventId,
      userId: ctx.userId,
      savedAt: new Date().toISOString(),
    };

    const saveResult = await this.savedEvents.save(savedEvent);
    if (saveResult.ok === false) {
      return Err(UnexpectedDependencyError(saveResult.value.message));
    }

    return Ok({ saved: true });
  }

  async listSavedEvents(
    ctx: SessionContext,
  ): Promise<Result<{ savedEvent: ISavedEventRecord; event: IEventRecord }[], SavedEventError>> {
    if (ctx.role !== "user") {
      return Err(Forbidden("Only members can view saved events."));
    }

    const savedResult = await this.savedEvents.findByUserId(ctx.userId);
    if (savedResult.ok === false) {
      return Err(UnexpectedDependencyError(savedResult.value.message));
    }

    const entries: { savedEvent: ISavedEventRecord; event: IEventRecord }[] = [];

    for (const savedEvent of savedResult.value) {
      const eventResult = await this.events.findById(savedEvent.eventId);
      if (eventResult.ok === false) {
        return Err(UnexpectedDependencyError(eventResult.value.message));
      }
      if (eventResult.value) {
        entries.push({ savedEvent, event: eventResult.value });
      }
    }

    return Ok(entries);
  }

  async isEventSaved(
    ctx: SessionContext,
    eventId: string,
  ): Promise<Result<boolean, SavedEventError>> {
    const result = await this.savedEvents.findByUserAndEvent(ctx.userId, eventId);
    if (result.ok === false) {
      return Err(UnexpectedDependencyError(result.value.message));
    }
    return Ok(result.value !== null);
  }
}

export function CreateSavedEventService(
  savedEvents: ISavedEventRepository,
  events: IEventRepository,
): ISavedEventService {
  return new SavedEventService(savedEvents, events);
}
