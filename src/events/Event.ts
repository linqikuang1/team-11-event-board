export type EventStatus = "draft" | "published" | "cancelled" | "concluded";

export type UserRole = "organizer" | "admin" | "member";

export interface IEventRecord {
  id: string;
  title: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  status: EventStatus;
  organizerId: string;
  createdAt: string;
  updatedAt: string;
  capacity: number | null;
  tags: string[];
}

export interface IEventSummary {
  id: string;
  title: string;
  location: string;
  startTime: string;
  endTime: string;
  status: EventStatus;
  organizerId: string;
}

export function toEventSummary(event: IEventRecord): IEventSummary {
  return {
    id: event.id,
    title: event.title,
    location: event.location,
    startTime: event.startTime,
    endTime: event.endTime,
    status: event.status,
    organizerId: event.organizerId,
  };
}