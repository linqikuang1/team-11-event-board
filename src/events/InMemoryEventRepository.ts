import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type EventError } from "./errors";
import type { IEventRepository } from "./EventRepository";
import type { IEventRecord } from "./Event";

class InMemoryEventRepository implements IEventRepository {
  constructor(private readonly events: IEventRecord[]) {}

  async save(event: IEventRecord): Promise<Result<IEventRecord, EventError>> {
    try {
      const index = this.events.findIndex((e) => e.id === event.id);
      if (index === -1) {
        this.events.push(event);
      } else {
        this.events[index] = event;
      }
      return Ok(event);
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the event."));
    }
  }

  async findById(id: string): Promise<Result<IEventRecord | null, EventError>> {
    try {
      const match = this.events.find((e) => e.id === id) ?? null;
      return Ok(match);
    } catch {
      return Err(UnexpectedDependencyError("Unable to find the event."));
    }
  }

  async findAll(filter?: { status?: string; organizerId?: string }): Promise<Result<IEventRecord[], EventError>> {
    try {
      let results = [...this.events];
      if (filter?.status) {
        results = results.filter((e) => e.status === filter.status);
      }
      if (filter?.organizerId) {
        results = results.filter((e) => e.organizerId === filter.organizerId);
      }
      return Ok(results);
    } catch {
      return Err(UnexpectedDependencyError("Unable to list events."));
    }
  }

  async delete(id: string): Promise<Result<boolean, EventError>> {
    try {
      const index = this.events.findIndex((e) => e.id === id);
      if (index === -1) {
        return Ok(false);
      }
      this.events.splice(index, 1);
      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to delete the event."));
    }
  }
}

export function CreateInMemoryEventRepository(): IEventRepository {
  return new InMemoryEventRepository([]);
}