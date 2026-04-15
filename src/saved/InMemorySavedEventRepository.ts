import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type SavedEventError } from "./errors";
import type { ISavedEventRepository } from "./SavedEventRepository";
import type { ISavedEventRecord } from "./SavedEvent";

class InMemorySavedEventRepository implements ISavedEventRepository {
  private readonly savedEvents: ISavedEventRecord[] = [];

  async save(savedEvent: ISavedEventRecord): Promise<Result<ISavedEventRecord, SavedEventError>> {
    try {
      this.savedEvents.push(savedEvent);
      return Ok(savedEvent);
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the bookmark."));
    }
  }

  async findByUserAndEvent(userId: string, eventId: string): Promise<Result<ISavedEventRecord | null, SavedEventError>> {
    try {
      const match = this.savedEvents.find((s) => s.userId === userId && s.eventId === eventId) ?? null;
      return Ok(match);
    } catch {
      return Err(UnexpectedDependencyError("Unable to find the bookmark."));
    }
  }

  async findByUserId(userId: string): Promise<Result<ISavedEventRecord[], SavedEventError>> {
    try {
      const results = this.savedEvents
        .filter((s) => s.userId === userId)
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
      return Ok(results);
    } catch {
      return Err(UnexpectedDependencyError("Unable to list bookmarks."));
    }
  }

  async delete(id: string): Promise<Result<boolean, SavedEventError>> {
    try {
      const index = this.savedEvents.findIndex((s) => s.id === id);
      if (index === -1) {
        return Ok(false);
      }
      this.savedEvents.splice(index, 1);
      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to delete the bookmark."));
    }
  }
}

export function CreateInMemorySavedEventRepository(): ISavedEventRepository {
  return new InMemorySavedEventRepository();
}
