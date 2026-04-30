import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type EventError } from "./errors";
import type { EventListQuery, IEventRepository } from "./EventRepository";
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

  async findUpcomingPublished(query: EventListQuery): Promise<Result<IEventRecord[], EventError>> {
    try {
      const nowMillis = new Date(query.nowIso).getTime();
      const q = (query.q ?? "").toLowerCase();
      const category = query.category?.toLowerCase() ?? null;
      const startFromMillis = query.startTimeFromIso
        ? new Date(query.startTimeFromIso).getTime()
        : null;
      const startToMillis = query.startTimeToIso
        ? new Date(query.startTimeToIso).getTime()
        : null;

      const results = this.events
        .filter((event) => {
          if (event.status !== "published") {
            return false;
          }

          if (new Date(event.endTime).getTime() <= nowMillis) {
            return false;
          }

          if (
            q.length > 0 &&
            !(
              event.title.toLowerCase().includes(q) ||
              event.description.toLowerCase().includes(q) ||
              event.location.toLowerCase().includes(q)
            )
          ) {
            return false;
          }

          if (category && !event.tags.some((tag) => tag.toLowerCase() === category)) {
            return false;
          }

          const startMillis = new Date(event.startTime).getTime();
          if (startFromMillis !== null && startMillis < startFromMillis) {
            return false;
          }
          if (startToMillis !== null && startMillis > startToMillis) {
            return false;
          }

          return true;
        })
        .sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
        );

      return Ok(results);
    } catch {
      return Err(UnexpectedDependencyError("Unable to list filtered events."));
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