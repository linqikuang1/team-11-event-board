# CONTRACTS.md

> **Purpose:** This file defines the interface contracts for every service method shared across two or more features. No feature code may be written until the relevant contracts below are agreed upon. Each contract specifies the method signature, the shape of a successful result, and every named error the method can raise.
>
> **Conventions used throughout:**
> - `EventId` — opaque string identifier (UUID v4)
> - `UserId` — opaque string identifier drawn from the session
> - `Role` — enum: `"organizer" | "admin" | "member"`
> - `EventStatus` — enum: `"draft" | "published" | "cancelled" | "concluded"`
> - Timestamps are ISO-8601 strings (e.g. `"2025-09-01T14:00:00Z"`)
> - All service methods are **async** and return a `Result<T, NamedError>`
> - The organizer's identity is **always** sourced from the session; it must never be accepted from form input

---

## Table of Contents

1. [Shared Types](#1-shared-types)
2. [Feature 1 — Event Creation](#2-feature-1--event-creation)
3. [Feature 2 — Event Detail Page](#3-feature-2--event-detail-page)
4. [Feature 3 — Event Editing](#4-feature-3--event-editing)
5. [Feature 4 — RSVP Toggle](#5-feature-4--rsvp-toggle)
6. [Feature 5 — Event Publishing and Cancellation](#6-feature-5--event-publishing-and-cancellation)
7. [Feature 6 — Category and Date Filter](#7-feature-6--category-and-date-filter)
8. [Feature 10 — Event Search](#8-feature-10--event-search)
9. [Feature 11 — Past Event Archiving](#9-feature-11--past-event-archiving)
10. [Feature 13 — Event Comments](#10-feature-13--event-comments)
11. [Feature 14 — Save for Later](#11-feature-14--save-for-later)
12. [Shared Repository Contract](#12-shared-repository-contract)

---

## 1. Shared Types

These types are referenced by multiple contracts and must be stable before any service is implemented.

```ts
// Core domain object
interface Event {
  id:          EventId;         // assigned by the repository on creation
  title:       string;          // 1–200 characters
  description: string;          // 0–5000 characters
  location:    string;          // 1–300 characters
  startTime:   string;          // ISO-8601; must be in the future at creation time
  endTime:     string;          // ISO-8601; must be strictly after startTime
  status:      EventStatus;     // starts as "draft"
  organizerId: UserId;          // set from session; never from form
  createdAt:   string;          // ISO-8601; set by repository
  updatedAt:   string;          // ISO-8601; set by repository on every write
  capacity:    number | null;   // positive integer, or null = unlimited
  tags:        string[];        // 0–10 tags, each 1–50 characters
}

// Subset accepted as input on creation
type CreateEventInput = Omit<Event,
  "id" | "status" | "organizerId" | "createdAt" | "updatedAt"
>;

// Subset accepted as input on editing (all fields optional)
type UpdateEventInput = Partial<CreateEventInput>;

// Caller context passed into every service call
interface SessionContext {
  userId: UserId;
  role:   Role;
}
```

---

## 2. Feature 1 — Event Creation

### 2.1 `EventService.createEvent`

**Shared with:** Feature 3 (validation rules are reused), Feature 5 (publishing may follow creation), Feature 12 (repository write).

#### Signature

```ts
createEvent(
  ctx:   SessionContext,
  input: CreateEventInput
): Promise<Result<Event, CreateEventError>>
```

#### Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| `ctx` | `SessionContext` | Must have `role === "organizer"` or `role === "admin"` |
| `input.title` | `string` | Required; 1–200 characters |
| `input.description` | `string` | Optional; 0–5000 characters; defaults to `""` |
| `input.location` | `string` | Required; 1–300 characters |
| `input.startTime` | `string` | Required; valid ISO-8601; must be in the future |
| `input.endTime` | `string` | Required; valid ISO-8601; must be strictly after `startTime` |
| `input.capacity` | `number \| null` | Optional; positive integer or `null`; defaults to `null` |
| `input.tags` | `string[]` | Optional; 0–10 items; each 1–50 chars; defaults to `[]` |

#### Successful Result

```ts
{
  ok:    true,
  value: Event   // fully populated Event with status === "draft"
}
```

The returned event has:
- `id` assigned by the repository
- `organizerId` set to `ctx.userId` (never from input)
- `status` set to `"draft"`
- `createdAt` and `updatedAt` set to the current timestamp

#### Named Errors

```ts
type CreateEventError =
  | { code: "FORBIDDEN";        message: string }
  | { code: "VALIDATION_ERROR"; message: string; fields: Record<string, string> }
  | { code: "REPOSITORY_ERROR"; message: string }
```

| Error code | When it is raised |
|------------|-------------------|
| `FORBIDDEN` | `ctx.role === "member"` |
| `VALIDATION_ERROR` | Any input field fails validation. `fields` maps each failing field name to a human-readable reason. |
| `REPOSITORY_ERROR` | The underlying store fails to persist the event |

#### Validation Rules (canonical — reused by Feature 3)

These rules live in a shared `validateEventInput(input)` helper so Feature 3 can call the same function:

1. `title` must be present and 1–200 characters
2. `description` must be 0–5000 characters
3. `location` must be present and 1–300 characters
4. `startTime` must be a valid ISO-8601 datetime and must be in the future (relative to wall clock at call time)
5. `endTime` must be a valid ISO-8601 datetime and must be **strictly after** `startTime`
6. `capacity`, if provided, must be a positive integer (≥ 1)
7. `tags` must contain 0–10 items, each 1–50 non-empty characters

---

## 3. Feature 2 — Event Detail Page

> **Status:** 🔲 Not started — fill in before implementation begins.

### 3.1 `EventService.getEventById`

#### Signature

```ts
// TODO
```

#### Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| | | _TODO_ |

#### Successful Result

```
TODO
```

#### Named Errors

```ts
type GetEventError =
  // TODO
```

#### Open Questions

- [ ] Can members view `"draft"` events, or only `"published"` ones?
- [ ] What fields are visible to members vs organizers vs admins?
- [ ] Should view count or attendance count be returned alongside the event?

---

## 4. Feature 3 — Event Editing

### 4.1 `EventService.updateEvent`

**Shared with:** Feature 1 (same validation rules), Feature 5 (status guard reused by cancellation), Feature 12 (repository write).

#### Signature

```ts
updateEvent(
  ctx:     SessionContext,
  eventId: EventId,
  input:   UpdateEventInput
): Promise<Result<Event, UpdateEventError>>
```

#### Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| `ctx` | `SessionContext` | Organizer may only edit their own events; admin may edit any |
| `eventId` | `EventId` | The event to edit |
| `input` | `UpdateEventInput` | Partial; only provided fields are updated. Fields not included remain unchanged. |

Validation of provided fields follows the **same rules** as `createEvent` (section 2.1). Exception: `startTime` does not need to be in the future if it is not being changed.

#### Successful Result

```ts
{
  ok:    true,
  value: Event   // updated Event; updatedAt is refreshed
}
```

#### Named Errors

```ts
type UpdateEventError =
  | { code: "FORBIDDEN";         message: string }
  | { code: "NOT_FOUND";         message: string }
  | { code: "UNEDITABLE_STATUS"; message: string; status: EventStatus }
  | { code: "VALIDATION_ERROR";  message: string; fields: Record<string, string> }
  | { code: "REPOSITORY_ERROR";  message: string }
```

| Error code | When it is raised |
|------------|-------------------|
| `FORBIDDEN` | `ctx.role === "member"`, **or** `ctx.role === "organizer"` and `event.organizerId !== ctx.userId` |
| `NOT_FOUND` | No event exists for `eventId` |
| `UNEDITABLE_STATUS` | `event.status === "cancelled"` or `event.status === "concluded"`. The `status` field echoes back the current status. |
| `VALIDATION_ERROR` | Any provided field fails validation |
| `REPOSITORY_ERROR` | The underlying store fails to persist the update |

#### Status Guard (canonical — reused by Feature 5)

An event is editable **only** when `status === "draft"` or `status === "published"`. Any other status must produce `UNEDITABLE_STATUS` before any field-level validation runs.

---

## 5. Feature 4 — RSVP Toggle

> **Status:** ✅ Mostly Implemented for Sprint 1

### 5.1 `EventService.toggleRsvp`

#### Signature

```ts
toggleRsvp(
  ctx: SessionContext,
  eventId: string,
): Promise<Result<ToggleRsvpResult, EventError>>

#### Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| ctx | SessionContext | Authenticated caller. Role must be a 'user', as staff and admins are rejected for this purpose. |
| eventId | string | UUID of the target event happening.

#### Successful Result

```
Returns Ok<ToggleRsvpResult>. The outcome field communicates which of the
three cases was applied:
```

#### Named Errors

```ts
type RsvpToggleError =
  // TODO
```

#### Open Questions

- [ ] Which roles can RSVP — members only, or organizers too?
- [ ] What happens when capacity is reached — hard reject or waitlist?
- [ ] Can a user RSVP to a `"draft"` event, or only `"published"` ones?
- [ ] Is there a deadline after which RSVPs are no longer accepted?

---

## 6. Feature 5 — Event Publishing and Cancellation

> **Status:** ✅ Mostly Implemented for Sprint 1

### 6.1 `EventService.publishEvent`

#### Signature

```ts
// TODO
```

#### Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| | | _TODO_ |

#### Successful Result

```
TODO
```

#### Named Errors

```ts
type PublishEventError =
  // TODO
```

### 6.2 `EventService.cancelEvent`

#### Signature

```ts
// TODO
```

#### Named Errors

```ts
type CancelEventError =
  // TODO
```

#### Open Questions

- [ ] Which roles may publish? Which may cancel?
- [ ] Can admins publish or cancel events they don't own?
- [ ] Is cancellation irreversible?
- [ ] Should RSVPed members be notified on cancellation?
- [ ] Which status transitions are valid (e.g. only `"draft"` → `"published"`)?

---

## 7. Feature 6 — Category and Date Filter

> **Status:** 🔲 Not started — fill in before implementation begins.

### 7.1 `EventService.filterEvents`

#### Signature

```ts
// TODO
```

#### Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| | | _TODO_ |

#### Successful Result

```
TODO
```

#### Named Errors

```ts
type FilterEventsError =
  // TODO
```

#### Open Questions

- [ ] What categories/tags are valid — free-form strings or a fixed enum?
- [ ] Is date filter by `startTime`, `endTime`, or a range that overlaps either?
- [ ] Can filters be combined (category AND date range)?
- [ ] Does this share an implementation with Feature 10 (search)?

---

## 8. Feature 10 — Event Search

> **Status:** 🔲 Not started — fill in before implementation begins.

### 8.1 `EventService.searchEvents`

#### Signature

```ts
// TODO
```

#### Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| | | _TODO_ |

#### Successful Result

```
TODO
```

#### Named Errors

```ts
type SearchEventsError =
  // TODO
```

#### Open Questions

- [ ] Which fields are searched — `title` only, or `title` + `description` + `location`?
- [ ] Is search case-insensitive? Does it support partial matches?
- [ ] Should results be ranked by relevance or sorted by `startTime`?
- [ ] Does this share an implementation with Feature 6 (filter)?

---

## 9. Feature 11 — Past Event Archiving

> **Status:** 🔲 Not started — fill in before implementation begins.

### 9.1 `EventService.archiveEvent`

#### Signature

```ts
// TODO
```

#### Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| | | _TODO_ |

#### Successful Result

```
TODO
```

#### Named Errors

```ts
type ArchiveEventError =
  // TODO
```

#### Open Questions

- [ ] Is archiving triggered manually or automatically when `endTime` passes?
- [ ] Does `"concluded"` map to archived, or is there a separate `"archived"` status?
- [ ] Are archived events visible to members at all?
- [ ] Can an archived event be unarchived?

---

## 10. Feature 13 — Event Comments

> **Status:** 🔲 Not started — fill in before implementation begins.

### 10.1 `CommentService.addComment`

#### Signature

```ts
// TODO
```

#### Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| | | _TODO_ |

#### Successful Result

```
TODO
```

#### Named Errors

```ts
type AddCommentError =
  // TODO
```

### 10.2 `CommentService.deleteComment`

#### Signature

```ts
// TODO
```

#### Named Errors

```ts
type DeleteCommentError =
  // TODO
```

#### Open Questions

- [ ] Which roles can comment — members only, or organizers too?
- [ ] Can a commenter edit their own comment, or only delete?
- [ ] Can organizers/admins delete any comment on their event?
- [ ] Are comments visible on `"draft"` events or only `"published"` ones?

---

## 11. Feature 14 — Save for Later

> **Status:** 🔲 Not started — fill in before implementation begins.

### 11.1 `SavedEventService.saveEvent`

#### Signature

```ts
// TODO
```

#### Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| | | _TODO_ |

#### Successful Result

```
TODO
```

#### Named Errors

```ts
type SaveEventError =
  // TODO
```

### 11.2 `SavedEventService.unsaveEvent`

#### Signature

```ts
// TODO
```

#### Named Errors

```ts
type UnsaveEventError =
  // TODO
```

#### Open Questions

- [ ] Which roles can save events — members only, or all roles?
- [ ] Should saving a cancelled or concluded event be allowed?
- [ ] Is there a limit on how many events a user can save?
- [ ] Should saved events appear in a dedicated "saved" list view?

---

## 12. Shared Repository Contract

All service methods depend on the event repository. The in-memory implementation for Sprint 1 must satisfy this interface so it can be swapped for a persistent store later without changing any service code.

### 12.1 `EventRepository`

```ts
interface EventRepository {
  save(event: Event): Promise<Event>;
  findById(id: EventId): Promise<Event | null>;
  findAll(filter?: Partial<Pick<Event, "status" | "organizerId">>): Promise<Event[]>;
  delete(id: EventId): Promise<void>;
}
```

| Method | Notes |
|--------|-------|
| `save` | Upsert: insert on first call, update on subsequent calls. Sets `createdAt` once; always refreshes `updatedAt`. |
| `findById` | Returns `null` (not an error) when the event does not exist. Services translate `null` into a `NOT_FOUND` error. |
| `findAll` | Returns all events when no filter is supplied. |
| `delete` | Silent no-op if `id` does not exist. |

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| _(fill in)_ | _(team)_ | Initial draft — Features 1 & 3 fully specified; Features 2, 4, 5, 6, 10, 11, 13, 14 templated |