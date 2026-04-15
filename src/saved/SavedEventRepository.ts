import type { Result } from "../lib/result";
import type { SavedEventError } from "./errors";
import type { ISavedEventRecord } from "./SavedEvent";

export interface ISavedEventRepository {
  save(savedEvent: ISavedEventRecord): Promise<Result<ISavedEventRecord, SavedEventError>>;
  findByUserAndEvent(userId: string, eventId: string): Promise<Result<ISavedEventRecord | null, SavedEventError>>;
  findByUserId(userId: string): Promise<Result<ISavedEventRecord[], SavedEventError>>;
  delete(id: string): Promise<Result<boolean, SavedEventError>>;
}
