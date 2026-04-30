import type { Result } from "../lib/result";
import type { EventError } from "./errors";
import type { IEventRecord } from "./Event";

export interface EventListQuery {
  nowIso: string;
  q?: string;
  category?: string;
  startTimeFromIso?: string;
  startTimeToIso?: string;
}

export interface IEventRepository {
  save(event: IEventRecord): Promise<Result<IEventRecord, EventError>>;
  findById(id: string): Promise<Result<IEventRecord | null, EventError>>;
  findAll(filter?: { status?: string; organizerId?: string }): Promise<Result<IEventRecord[], EventError>>;
  findUpcomingPublished(query: EventListQuery): Promise<Result<IEventRecord[], EventError>>;
  delete(id: string): Promise<Result<boolean, EventError>>;
}