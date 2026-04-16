import type { Result } from "../lib/result";
import type { EventError } from "./errors";
import type { IEventRecord } from "./Event";

export interface IEventRepository {
  save(event: IEventRecord): Promise<Result<IEventRecord, EventError>>;
  findById(id: string): Promise<Result<IEventRecord | null, EventError>>;
  findAll(filter?: { status?: string; organizerId?: string }): Promise<Result<IEventRecord[], EventError>>;
  delete(id: string): Promise<Result<boolean, EventError>>;
}