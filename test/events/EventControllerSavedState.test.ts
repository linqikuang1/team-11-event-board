import type { Response } from "express";
import { Ok } from "../../src/lib/result";
import { CreateEventController } from "../../src/events/EventController";
import type { IEventService, SessionContext } from "../../src/events/EventService";
import type { IAppBrowserSession } from "../../src/session/AppSession";
import type { ISavedEventService } from "../../src/saved/SavedEventService";
import type { IEventRecord } from "../../src/events/Event";

function makeSession(role: "user" | "staff" | "admin"): IAppBrowserSession {
  return {
    browserId: "b1",
    browserLabel: "Browser B1",
    visitCount: 1,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    authenticatedUser: {
      userId: "user-1",
      email: "user@app.test",
      displayName: "User",
      role,
      signedInAt: new Date().toISOString(),
    },
  };
}

describe("EventController.showEventDetail saved state", () => {
  it("passes isSaved=true for members when SavedEventService returns true", async () => {
    const event: IEventRecord = {
      id: "event-1",
      title: "Event",
      description: "",
      location: "Room",
      startTime: new Date(Date.now() + 1000).toISOString(),
      endTime: new Date(Date.now() + 2000).toISOString(),
      status: "published",
      organizerId: "staff-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      capacity: null,
      tags: [],
    };

    const eventService: Pick<IEventService, "getEventById" | "getRsvpState"> = {
      getEventById: async (_ctx: SessionContext, _eventId: string) => Ok(event),
      getRsvpState: async () => Ok({ outcome: null, attendeeCount: 0 }),
    };

    const savedService: Pick<ISavedEventService, "isEventSaved"> = {
      isEventSaved: async (_ctx: SessionContext, _eventId: string) => Ok(true),
    };

    const controller = CreateEventController(
      eventService as IEventService,
      savedService as ISavedEventService,
      { info: () => undefined, warn: () => undefined, error: () => undefined },
    );

    const res = { render: jest.fn(), status: jest.fn(() => res) } as unknown as Response;
    await controller.showEventDetail(res, "event-1", makeSession("user"));

    expect((res.render as unknown as jest.Mock).mock.calls[0][0]).toBe("events/show");
    expect((res.render as unknown as jest.Mock).mock.calls[0][1]).toMatchObject({ isSaved: true });
  });

  it("defaults isSaved=false for non-member roles", async () => {
    const event: IEventRecord = {
      id: "event-1",
      title: "Event",
      description: "",
      location: "Room",
      startTime: new Date(Date.now() + 1000).toISOString(),
      endTime: new Date(Date.now() + 2000).toISOString(),
      status: "published",
      organizerId: "staff-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      capacity: null,
      tags: [],
    };

    const eventService: Pick<IEventService, "getEventById" | "getRsvpState"> = {
      getEventById: async (_ctx: SessionContext, _eventId: string) => Ok(event),
      getRsvpState: async () => Ok({ outcome: null, attendeeCount: 0 }),
    };

    const savedService: Pick<ISavedEventService, "isEventSaved"> = {
      isEventSaved: async () => Ok(true),
    };

    const controller = CreateEventController(
      eventService as IEventService,
      savedService as ISavedEventService,
      { info: () => undefined, warn: () => undefined, error: () => undefined },
    );

    const res = { render: jest.fn(), status: jest.fn(() => res) } as unknown as Response;
    await controller.showEventDetail(res, "event-1", makeSession("staff"));

    expect((res.render as unknown as jest.Mock).mock.calls[0][1]).toMatchObject({ isSaved: false });
  });
});

