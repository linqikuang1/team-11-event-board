# Interface Contracts

This document records the interface contracts that define the boundaries between architectural layers in the application. Each contract specifies method signatures, input/output types, and error handling — enabling layers to be developed, tested, and swapped independently.

## Architecture Overview

```
┌─────────────┐
│   Server     │  IServer
└──────┬───────┘
       │
┌──────▼───────┐
│  Application  │  IApp  (Express setup, routing, middleware)
└──────┬───────┘
       │
┌──────▼───────┐
│  Controllers  │  IAuthController  (translate HTTP ↔ service calls)
└──────┬───────┘
       │
┌──────▼───────┐
│   Services    │  IAuthService, IAdminUserService  (business logic)
└──────┬───────┘
       │
┌──────▼───────┐
│ Repositories  │  IUserRepository  (data access)
└───────────────┘

Cross-cutting: ILoggingService, IPasswordHasher
```

Dependencies always point **downward**. Upper layers depend on interfaces, never on concrete implementations. All wiring happens in `src/composition.ts`.

---

## Result Type

**File:** `src/lib/result.ts`

All service and repository methods return a `Result<T, E>` instead of throwing exceptions. This keeps error handling explicit and composable.

```typescript
interface Ok<T>  { ok: true;  value: T }
interface Err<E> { ok: false; value: E }

type Result<T, E> = Ok<T> | Err<E>
```

Constructors: `Ok(value)` and `Err(value)`.

---

## Application Layer

### IApp

**File:** `src/contracts.ts`
**Implemented by:** `ExpressApp` in `src/app.ts`
**Responsibility:** Configures middleware, templating, and routes. Provides the Express instance to the server and tests.

```typescript
interface IApp {
  getExpressApp(): express.Express
}
```

**Factory:** `CreateApp(authController: IAuthController, logger: ILoggingService): IApp`

### IServer

**File:** `src/contracts.ts`
**Responsibility:** Starts the HTTPS listener. This is the runtime boundary.

```typescript
interface IServer {
  start(port: number): void
}
```

---

## Controller Layer

### IAuthController

**File:** `src/auth/AuthController.ts`
**Implemented by:** `AuthController`
**Depends on:** `IAuthService`, `IAdminUserService`, `ILoggingService`
**Responsibility:** Translates HTTP requests into service calls and renders views with the results.

```typescript
interface IAuthController {
  showLogin(
    res: Response,
    session: IAppBrowserSession,
    pageError?: string | null,
  ): Promise<void>

  showAdminUsers(
    res: Response,
    session: IAppBrowserSession,
    pageError?: string | null,
  ): Promise<void>

  loginFromForm(
    res: Response,
    email: string,
    password: string,
    store: AppSessionStore,
  ): Promise<void>

  logoutFromForm(
    res: Response,
    store: AppSessionStore,
  ): Promise<void>

  createUserFromForm(
    res: Response,
    input: { email: string; displayName: string; password: string; role: UserRole },
    session: IAppBrowserSession,
  ): Promise<void>

  deleteUserFromForm(
    res: Response,
    userId: string,
    actingUserId: string,
    session: IAppBrowserSession,
  ): Promise<void>
}
```

**Factory:** `CreateAuthController(service: IAuthService, adminUsers: IAdminUserService, logger: ILoggingService): IAuthController`

**Error-to-status mapping** (internal to the controller):

| AuthError name          | HTTP Status |
| ----------------------- | ----------- |
| `ValidationError`       | 400         |
| `InvalidCredentials`    | 401         |
| `AuthorizationRequired` | 403         |
| `UserNotFound`          | 404         |
| `UserAlreadyExists`     | 409         |
| `ProtectedUserOperation`| 409         |
| *(anything else)*       | 500         |

---

## Service Layer

### IAuthService

**File:** `src/auth/AuthService.ts`
**Implemented by:** `AuthService`
**Depends on:** `IUserRepository`, `IPasswordHasher`
**Responsibility:** Validates credentials and returns an authenticated user identity.

```typescript
interface LoginInput {
  email: string
  password: string
}

interface IAuthService {
  authenticate(input: LoginInput): Promise<Result<IAuthenticatedUser, AuthError>>
}
```

**Factory:** `CreateAuthService(users: IUserRepository, passwordHasher: IPasswordHasher): IAuthService`

**Possible errors:**

| Error                      | When                                      |
| -------------------------- | ----------------------------------------- |
| `ValidationError`          | Email or password is empty/malformed      |
| `InvalidCredentials`       | No matching user or wrong password        |
| `UnexpectedDependencyError`| Repository returned an error              |

### IAdminUserService

**File:** `src/auth/AdminUserService.ts`
**Implemented by:** `AdminUserService`
**Depends on:** `IUserRepository`, `IPasswordHasher`
**Responsibility:** Admin operations — list, create, and delete users.

```typescript
interface CreateUserInput {
  email: string
  displayName: string
  password: string
  role: UserRole
}

interface IAdminUserService {
  listUsers(): Promise<Result<IUserSummary[], AuthError>>
  createUser(input: CreateUserInput): Promise<Result<IUserSummary, AuthError>>
  deleteUser(id: string, actingUserId: string): Promise<Result<void, AuthError>>
}
```

**Factory:** `CreateAdminUserService(users: IUserRepository, passwordHasher: IPasswordHasher): IAdminUserService`

**Possible errors:**

| Method       | Error                      | When                                          |
| ------------ | -------------------------- | --------------------------------------------- |
| `listUsers`  | `UnexpectedDependencyError`| Repository failure                            |
| `createUser` | `ValidationError`          | Missing/invalid display name, email, password |
| `createUser` | `UserAlreadyExists`        | Email already registered                      |
| `createUser` | `UnexpectedDependencyError`| Repository failure                            |
| `deleteUser` | `ValidationError`          | Empty user ID                                 |
| `deleteUser` | `ProtectedUserOperation`   | Admin attempting to delete themselves          |
| `deleteUser` | `UserNotFound`             | No user with given ID                         |
| `deleteUser` | `UnexpectedDependencyError`| Repository failure                            |

---

## Repository Layer

### IUserRepository

**File:** `src/auth/UserRepository.ts`
**Implemented by:** `InMemoryUserRepository` in `src/auth/InMemoryUserRepository.ts`
**Responsibility:** Persist and retrieve user records. The interface is storage-agnostic — implementations can be in-memory, SQLite/Prisma, or any other backend.

```typescript
interface IUserRepository {
  findByEmail(email: string): Promise<Result<IUserRecord | null, AuthError>>
  findById(id: string): Promise<Result<IUserRecord | null, AuthError>>
  listUsers(): Promise<Result<IUserRecord[], AuthError>>
  createUser(user: IUserRecord): Promise<Result<IUserRecord, AuthError>>
  deleteUser(id: string): Promise<Result<boolean, AuthError>>
}
```

- `findByEmail` / `findById` return `null` (not an error) when no match is found.
- `deleteUser` returns `true` on success, `false` if the ID did not exist.

---

## Data Types

### User Types

**File:** `src/auth/User.ts`

```typescript
type UserRole = "admin" | "staff" | "user"

interface IUserRecord {
  id: string
  email: string
  displayName: string
  role: UserRole
  passwordHash: string
}

interface IAuthenticatedUser {
  id: string
  email: string
  displayName: string
  role: UserRole
}

interface IUserSummary {
  id: string
  email: string
  displayName: string
  role: UserRole
}
```

- `IUserRecord` is the full storage representation (includes `passwordHash`). Used only inside the repository layer.
- `IAuthenticatedUser` is the identity returned after successful login. Never includes the password hash.
- `IUserSummary` is the read-only projection used by admin listing endpoints. Structurally identical to `IAuthenticatedUser` but semantically distinct.

Conversion helpers: `toAuthenticatedUser(record)` and `toUserSummary(record)` strip the password hash.

### AuthError

**File:** `src/auth/errors.ts`

A discriminated union used by all auth services and the repository:

```typescript
type AuthError =
  | { name: "InvalidCredentials";        message: string }
  | { name: "AuthenticationRequired";    message: string }
  | { name: "AuthorizationRequired";     message: string }
  | { name: "UserAlreadyExists";         message: string }
  | { name: "UserNotFound";              message: string }
  | { name: "ProtectedUserOperation";    message: string }
  | { name: "ValidationError";           message: string }
  | { name: "UnexpectedDependencyError"; message: string }
```

Each variant has a named constructor (e.g., `ValidationError("message")`).

---

## Session Types

**File:** `src/session/AppSession.ts`

### IAuthenticatedUserSession

Stored in the session when a user is signed in. Passwords are never stored in the session.

```typescript
interface IAuthenticatedUserSession {
  userId: string
  email: string
  displayName: string
  role: UserRole
  signedInAt: string   // ISO 8601
}
```

### IAppBrowserSession

Tracks browser identity and visit history. Passed to views for rendering.

```typescript
interface IAppBrowserSession {
  browserId: string
  browserLabel: string
  visitCount: number
  createdAt: string          // ISO 8601
  lastSeenAt: string         // ISO 8601
  authenticatedUser: IAuthenticatedUserSession | null
}
```

### Session Helpers

| Function                    | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| `touchAppSession(store)`    | Ensure session exists, update `lastSeenAt`      |
| `recordPageView(store)`     | Increment `visitCount` and update `lastSeenAt`  |
| `signInAuthenticatedUser(store, user)` | Write user identity into the session |
| `signOutAuthenticatedUser(store)`      | Clear authenticated user from session |
| `getAuthenticatedUser(store)`          | Read the current user or `null`       |
| `isAuthenticatedSession(store)`        | Boolean check for authenticated state |

---

## Cross-Cutting Contracts

### ILoggingService

**File:** `src/service/LoggingService.ts`
**Implemented by:** `LoggingService` (singleton)
**Responsibility:** Timestamped console logging at three levels.

```typescript
interface ILoggingService {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}
```

**Factory:** `CreateLoggingService(): ILoggingService`

### IPasswordHasher

**File:** `src/auth/PasswordHasher.ts`
**Implemented by:** `ScryptPasswordHasher`
**Responsibility:** Hash passwords for storage and verify passwords against stored hashes. Uses Node.js scrypt with timing-safe comparison.

```typescript
interface IPasswordHasher {
  hash(password: string): string
  verify(password: string, storedHash: string): boolean
}
```

**Factory:** `CreatePasswordHasher(): IPasswordHasher`

Hash format: `<hex-salt>:<hex-hash>` (16-byte random salt, 64-byte derived key).

---

## HTTP Routes

These are the routes registered in `src/app.ts` and the authorization rules enforced at each.

| Method | Path                       | Auth Required | Role Required | Description              |
| ------ | -------------------------- | ------------- | ------------- | ------------------------ |
| GET    | `/`                        | No            | —             | Redirects to `/home` or `/login` |
| GET    | `/login`                   | No            | —             | Show login form          |
| POST   | `/login`                   | No            | —             | Authenticate user        |
| POST   | `/logout`                  | No            | —             | Sign out                 |
| GET    | `/home`                    | Yes           | any           | Authenticated home page  |
| GET    | `/admin/users`             | Yes           | `admin`       | List users               |
| POST   | `/admin/users`             | Yes           | `admin`       | Create a new user        |
| POST   | `/admin/users/:id/delete`  | Yes           | `admin`       | Delete a user            |

---

---

# Event Board Feature Contracts

These contracts define the interfaces for the event board features the team will build. They follow the same layered architecture and patterns (Result type, factory functions, dependency injection) as the starter code.

**Role mapping:** In the feature descriptions, "organizer" maps to the `staff` role and "member" maps to the `user` role. `admin` retains full access.

---

## Enumerations

### EventStatus

Represents the lifecycle state of an event.

```typescript
type EventStatus = "draft" | "published" | "cancelled" | "past"
```

**Valid transitions:**

```
draft → published    (Feature 5: organizer publishes)
published → cancelled (Feature 5: organizer or admin cancels — irreversible)
published → past      (Feature 11: automatic when endTime has elapsed)
```

### RsvpStatus

Represents a member's attendance state for a specific event.

```typescript
type RsvpStatus = "attending" | "waitlisted" | "cancelled"
```

**Transitions:**

```
(none) → attending     (RSVP when capacity available)
(none) → waitlisted    (RSVP when event is full)
attending → cancelled   (member cancels — triggers waitlist promotion, Feature 9)
waitlisted → cancelled  (member cancels waitlist spot)
cancelled → attending   (re-RSVP when capacity available)
cancelled → waitlisted  (re-RSVP when event is full)
waitlisted → attending  (automatic promotion when a spot opens, Feature 9)
```

---

## Event Data Types

**File:** `src/event/Event.ts`

```typescript
interface IEventRecord {
  id: string
  title: string
  description: string
  location: string
  category: string
  capacity: number
  status: EventStatus
  startTime: string          // ISO 8601
  endTime: string            // ISO 8601
  createdById: string        // user ID of the organizer
  createdAt: string          // ISO 8601
  updatedAt: string          // ISO 8601
}

interface IEventSummary {
  id: string
  title: string
  description: string
  location: string
  category: string
  capacity: number
  attendeeCount: number
  status: EventStatus
  startTime: string
  endTime: string
  createdById: string
  organizerName: string
}

interface IEventDetail extends IEventSummary {
  waitlistCount: number
  userRsvpStatus: RsvpStatus | null    // null if the viewing user has no RSVP
  userWaitlistPosition: number | null  // null if not waitlisted (Feature 9)
  isSavedByUser: boolean               // Feature 14
}
```

- `IEventRecord` — full storage row. Used only inside the repository.
- `IEventSummary` — projection for list views. Includes the computed `attendeeCount` and the `organizerName` resolved from the creator's user record.
- `IEventDetail` — extended projection for the detail page. Adds RSVP state relative to the viewing user, waitlist position, and saved status.

---

## RSVP Data Types

**File:** `src/rsvp/Rsvp.ts`

```typescript
interface IRsvpRecord {
  id: string
  eventId: string
  userId: string
  status: RsvpStatus
  createdAt: string          // ISO 8601
  updatedAt: string          // ISO 8601
}

interface IRsvpSummary {
  id: string
  eventId: string
  userId: string
  displayName: string
  status: RsvpStatus
  createdAt: string
}

interface IMyRsvpEntry {
  rsvp: IRsvpSummary
  event: IEventSummary
}
```

- `IRsvpRecord` — storage row.
- `IRsvpSummary` — includes the attendee's `displayName` for the attendee list (Feature 12).
- `IMyRsvpEntry` — joins an RSVP with its event for the My RSVPs dashboard (Feature 7).

---

## Comment Data Types

**File:** `src/comment/Comment.ts`

```typescript
interface ICommentRecord {
  id: string
  eventId: string
  userId: string
  content: string
  createdAt: string          // ISO 8601
}

interface ICommentSummary {
  id: string
  eventId: string
  userId: string
  authorName: string
  content: string
  createdAt: string
}
```

- `ICommentRecord` — storage row.
- `ICommentSummary` — includes the author's `displayName` for rendering.

---

## Saved Event Data Types

**File:** `src/saved/SavedEvent.ts`

```typescript
interface ISavedEventRecord {
  id: string
  eventId: string
  userId: string
  savedAt: string            // ISO 8601
}

interface ISavedEventEntry {
  saved: ISavedEventRecord
  event: IEventSummary
}
```

---

## Error Types

### EventError

**File:** `src/event/errors.ts`

```typescript
type EventError =
  | { name: "EventNotFound";          message: string }
  | { name: "ValidationError";        message: string }
  | { name: "UnauthorizedAction";     message: string }
  | { name: "InvalidStateTransition"; message: string }
  | { name: "UnexpectedError";        message: string }
```

| Error                    | When                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `EventNotFound`          | No event with given ID, or draft hidden from unauthorized viewer  |
| `ValidationError`        | Missing/invalid title, empty description, end before start, etc.  |
| `UnauthorizedAction`     | User lacks permission (wrong role or not the event owner)         |
| `InvalidStateTransition` | E.g., publishing an already-published event, editing a cancelled event |
| `UnexpectedError`        | Repository or infrastructure failure                              |

### RsvpError

**File:** `src/rsvp/errors.ts`

```typescript
type RsvpError =
  | { name: "EventNotFound";      message: string }
  | { name: "EventFull";          message: string }
  | { name: "InvalidRsvpState";   message: string }
  | { name: "UnauthorizedAction"; message: string }
  | { name: "ValidationError";    message: string }
  | { name: "UnexpectedError";    message: string }
```

| Error                | When                                                          |
| -------------------- | ------------------------------------------------------------- |
| `EventNotFound`      | Event does not exist or is not published                      |
| `EventFull`          | Capacity reached — member is placed on waitlist instead       |
| `InvalidRsvpState`   | RSVP to a cancelled/past event, or invalid toggle transition  |
| `UnauthorizedAction` | Organizers/admins cannot RSVP; only `user` role can           |
| `ValidationError`    | Missing event ID or user ID                                   |
| `UnexpectedError`    | Repository failure                                            |

### CommentError

**File:** `src/comment/errors.ts`

```typescript
type CommentError =
  | { name: "CommentNotFound";     message: string }
  | { name: "EventNotFound";       message: string }
  | { name: "ValidationError";     message: string }
  | { name: "UnauthorizedAction";  message: string }
  | { name: "UnexpectedError";     message: string }
```

| Error                | When                                                    |
| -------------------- | ------------------------------------------------------- |
| `CommentNotFound`    | Comment ID does not exist                               |
| `EventNotFound`      | Target event does not exist or is not published         |
| `ValidationError`    | Empty or too-long comment content                       |
| `UnauthorizedAction` | Deleting someone else's comment without organizer/admin role |
| `UnexpectedError`    | Repository failure                                      |

### SavedEventError

**File:** `src/saved/errors.ts`

```typescript
type SavedEventError =
  | { name: "EventNotFound";       message: string }
  | { name: "ValidationError";     message: string }
  | { name: "UnauthorizedAction";  message: string }
  | { name: "UnexpectedError";     message: string }
```

| Error                | When                                                 |
| -------------------- | ---------------------------------------------------- |
| `EventNotFound`      | Event does not exist                                 |
| `ValidationError`    | Saving a cancelled event                             |
| `UnauthorizedAction` | Organizers/admins cannot save events; only `user` role |
| `UnexpectedError`    | Repository failure                                   |

---

## Repository Layer

### IEventRepository

**File:** `src/event/EventRepository.ts`
**Responsibility:** Persist and retrieve event records. Storage-agnostic.

```typescript
interface IEventRepository {
  findById(id: string): Promise<Result<IEventRecord | null, EventError>>
  listPublished(): Promise<Result<IEventRecord[], EventError>>
  listByStatus(status: EventStatus): Promise<Result<IEventRecord[], EventError>>
  listByOrganizer(userId: string): Promise<Result<IEventRecord[], EventError>>
  listAll(): Promise<Result<IEventRecord[], EventError>>
  search(query: string): Promise<Result<IEventRecord[], EventError>>
  create(event: IEventRecord): Promise<Result<IEventRecord, EventError>>
  update(event: IEventRecord): Promise<Result<IEventRecord, EventError>>
  delete(id: string): Promise<Result<boolean, EventError>>
}
```

- `findById` returns `null` when no match is found.
- `search` matches against title, description, and location (case-insensitive).
- `listPublished` returns only events with `status === "published"`.

### IRsvpRepository

**File:** `src/rsvp/RsvpRepository.ts`
**Responsibility:** Persist and retrieve RSVP records.

```typescript
interface IRsvpRepository {
  findByUserAndEvent(userId: string, eventId: string): Promise<Result<IRsvpRecord | null, RsvpError>>
  listByEvent(eventId: string): Promise<Result<IRsvpRecord[], RsvpError>>
  listByUser(userId: string): Promise<Result<IRsvpRecord[], RsvpError>>
  countAttending(eventId: string): Promise<Result<number, RsvpError>>
  create(rsvp: IRsvpRecord): Promise<Result<IRsvpRecord, RsvpError>>
  update(rsvp: IRsvpRecord): Promise<Result<IRsvpRecord, RsvpError>>
  findNextWaitlisted(eventId: string): Promise<Result<IRsvpRecord | null, RsvpError>>
}
```

- `countAttending` returns the number of RSVPs with `status === "attending"` for a given event.
- `findNextWaitlisted` returns the earliest waitlisted RSVP for promotion (Feature 9), or `null` if the waitlist is empty.

### ICommentRepository

**File:** `src/comment/CommentRepository.ts`
**Responsibility:** Persist and retrieve comment records.

```typescript
interface ICommentRepository {
  findById(id: string): Promise<Result<ICommentRecord | null, CommentError>>
  listByEvent(eventId: string): Promise<Result<ICommentRecord[], CommentError>>
  create(comment: ICommentRecord): Promise<Result<ICommentRecord, CommentError>>
  delete(id: string): Promise<Result<boolean, CommentError>>
}
```

- `listByEvent` returns comments in chronological order (oldest first).

### ISavedEventRepository

**File:** `src/saved/SavedEventRepository.ts`
**Responsibility:** Persist and retrieve saved/bookmarked event records.

```typescript
interface ISavedEventRepository {
  findByUserAndEvent(userId: string, eventId: string): Promise<Result<ISavedEventRecord | null, SavedEventError>>
  listByUser(userId: string): Promise<Result<ISavedEventRecord[], SavedEventError>>
  create(saved: ISavedEventRecord): Promise<Result<ISavedEventRecord, SavedEventError>>
  delete(id: string): Promise<Result<boolean, SavedEventError>>
}
```

---

## Service Layer

### IEventService

**File:** `src/event/EventService.ts`
**Depends on:** `IEventRepository`
**Responsibility:** Business logic for event CRUD, lifecycle transitions, filtering, searching, and archiving.

```typescript
interface CreateEventInput {
  title: string
  description: string
  location: string
  category: string
  capacity: number
  startTime: string
  endTime: string
}

interface UpdateEventInput {
  title: string
  description: string
  location: string
  category: string
  capacity: number
  startTime: string
  endTime: string
}

interface EventFilterInput {
  category?: string
  timeframe?: "upcoming" | "this-week" | "this-weekend"
  search?: string
}

interface IEventService {
  // Feature 1 — Event Creation
  createEvent(input: CreateEventInput, createdById: string): Promise<Result<IEventSummary, EventError>>

  // Feature 2 — Event Detail
  getEventDetail(eventId: string, viewingUserId: string, viewingUserRole: UserRole): Promise<Result<IEventDetail, EventError>>

  // Feature 3 — Event Editing
  updateEvent(eventId: string, input: UpdateEventInput, actingUserId: string, actingUserRole: UserRole): Promise<Result<IEventSummary, EventError>>

  // Feature 5 — Publishing and Cancellation
  publishEvent(eventId: string, actingUserId: string, actingUserRole: UserRole): Promise<Result<IEventSummary, EventError>>
  cancelEvent(eventId: string, actingUserId: string, actingUserRole: UserRole): Promise<Result<IEventSummary, EventError>>

  // Feature 6 — Filtering and Feature 10 — Search
  listEvents(filters: EventFilterInput): Promise<Result<IEventSummary[], EventError>>

  // Feature 8 — Organizer Dashboard
  listEventsByOrganizer(organizerId: string): Promise<Result<IEventSummary[], EventError>>
  listAllEvents(): Promise<Result<IEventSummary[], EventError>>

  // Feature 11 — Past Event Archiving
  archiveExpiredEvents(): Promise<Result<number, EventError>>
  listArchivedEvents(category?: string): Promise<Result<IEventSummary[], EventError>>
}
```

**Possible errors by method:**

| Method              | Error                    | When                                                     |
| ------------------- | ------------------------ | -------------------------------------------------------- |
| `createEvent`       | `ValidationError`        | Missing title, end before start, capacity < 1, etc.      |
| `getEventDetail`    | `EventNotFound`          | No event with ID, or draft hidden from non-owner/non-admin |
| `updateEvent`       | `EventNotFound`          | No event with ID                                         |
| `updateEvent`       | `UnauthorizedAction`     | Not the owner and not admin                              |
| `updateEvent`       | `InvalidStateTransition` | Event is cancelled or past                               |
| `updateEvent`       | `ValidationError`        | Same rules as creation                                   |
| `publishEvent`      | `EventNotFound`          | No event with ID                                         |
| `publishEvent`      | `UnauthorizedAction`     | Not the owner and not admin                              |
| `publishEvent`      | `InvalidStateTransition` | Event is not in draft status                             |
| `cancelEvent`       | `EventNotFound`          | No event with ID                                         |
| `cancelEvent`       | `UnauthorizedAction`     | Not the owner and not admin                              |
| `cancelEvent`       | `InvalidStateTransition` | Event is not in published status                         |
| `listEvents`        | `ValidationError`        | Invalid filter values                                    |

**Validation rules for creation and editing:**

- `title` is required and non-empty.
- `description` is required and non-empty.
- `location` is required and non-empty.
- `category` is required and non-empty.
- `capacity` must be a positive integer (>= 1).
- `startTime` and `endTime` must be valid ISO 8601 timestamps.
- `endTime` must be strictly after `startTime`.
- The organizer's identity comes from the session, never from form input.

### IRsvpService

**File:** `src/rsvp/RsvpService.ts`
**Depends on:** `IRsvpRepository`, `IEventRepository`
**Responsibility:** Toggle RSVP status, enforce capacity, manage the waitlist, and handle automatic promotion.

```typescript
interface RsvpToggleResult {
  newStatus: RsvpStatus
  attendeeCount: number
  waitlistPosition: number | null
}

interface IRsvpService {
  // Feature 4 — RSVP Toggle
  toggleRsvp(eventId: string, userId: string, userRole: UserRole): Promise<Result<RsvpToggleResult, RsvpError>>

  // Feature 7 — My RSVPs Dashboard
  listUserRsvps(userId: string): Promise<Result<{ upcoming: IMyRsvpEntry[]; past: IMyRsvpEntry[] }, RsvpError>>

  // Feature 9 — Waitlist Promotion (called internally by toggleRsvp on cancellation)
  promoteNextWaitlisted(eventId: string): Promise<Result<IRsvpRecord | null, RsvpError>>

  // Feature 9 — Waitlist Position
  getWaitlistPosition(eventId: string, userId: string): Promise<Result<number | null, RsvpError>>

  // Feature 12 — Attendee List
  listEventAttendees(eventId: string, actingUserId: string, actingUserRole: UserRole): Promise<Result<{ attending: IRsvpSummary[]; waitlisted: IRsvpSummary[]; cancelled: IRsvpSummary[] }, RsvpError>>
}
```

**Possible errors by method:**

| Method                  | Error                | When                                                    |
| ----------------------- | -------------------- | ------------------------------------------------------- |
| `toggleRsvp`            | `EventNotFound`      | Event does not exist or is not published                |
| `toggleRsvp`            | `InvalidRsvpState`   | Event is cancelled or past                              |
| `toggleRsvp`            | `UnauthorizedAction` | User is `staff` or `admin` (only `user` role can RSVP) |
| `listUserRsvps`         | `UnexpectedError`    | Repository failure                                      |
| `promoteNextWaitlisted` | `UnexpectedError`    | Repository failure                                      |
| `listEventAttendees`    | `EventNotFound`      | Event does not exist                                    |
| `listEventAttendees`    | `UnauthorizedAction` | Not the event organizer and not admin                   |

**Toggle logic (Feature 4 + Feature 9):**

1. **No existing RSVP:** If `attendeeCount < capacity`, create with `attending`. Otherwise create with `waitlisted`.
2. **Existing `attending`:** Set to `cancelled`, then call `promoteNextWaitlisted` atomically (Feature 9).
3. **Existing `waitlisted`:** Set to `cancelled`.
4. **Existing `cancelled`:** Reactivate — same logic as step 1.

**Coordination note (Feature 9):** The cancellation-and-promotion must be atomic. When backed by Prisma (Sprint 3), both operations must be wrapped in a single database transaction.

### ICommentService

**File:** `src/comment/CommentService.ts`
**Depends on:** `ICommentRepository`, `IEventRepository`
**Responsibility:** Post and delete comments, enforce deletion permissions.

```typescript
interface PostCommentInput {
  eventId: string
  content: string
}

interface ICommentService {
  // Feature 13 — Post comment
  postComment(input: PostCommentInput, userId: string): Promise<Result<ICommentSummary, CommentError>>

  // Feature 13 — Delete comment
  deleteComment(commentId: string, actingUserId: string, actingUserRole: UserRole, eventOwnerId: string): Promise<Result<void, CommentError>>

  // Feature 13 — List comments for an event
  listComments(eventId: string): Promise<Result<ICommentSummary[], CommentError>>
}
```

**Possible errors by method:**

| Method          | Error                | When                                                  |
| --------------- | -------------------- | ----------------------------------------------------- |
| `postComment`   | `EventNotFound`      | Event does not exist or is not published              |
| `postComment`   | `ValidationError`    | Empty or too-long content                             |
| `deleteComment` | `CommentNotFound`    | Comment ID does not exist                             |
| `deleteComment` | `UnauthorizedAction` | Not the author, not the event organizer, and not admin |

**Deletion permissions:**
- The comment author can delete their own comment.
- The event organizer can delete any comment on their event.
- An admin can delete any comment anywhere.

### ISavedEventService

**File:** `src/saved/SavedEventService.ts`
**Depends on:** `ISavedEventRepository`, `IEventRepository`
**Responsibility:** Toggle saved/bookmarked status and list a member's saved events.

```typescript
interface ISavedEventService {
  // Feature 14 — Toggle save
  toggleSave(eventId: string, userId: string, userRole: UserRole): Promise<Result<boolean, SavedEventError>>

  // Feature 14 — Saved list
  listSavedEvents(userId: string): Promise<Result<ISavedEventEntry[], SavedEventError>>
}
```

- `toggleSave` returns `true` if the event is now saved, `false` if it was unsaved.

**Possible errors by method:**

| Method            | Error                | When                                                  |
| ----------------- | -------------------- | ----------------------------------------------------- |
| `toggleSave`      | `EventNotFound`      | Event does not exist                                  |
| `toggleSave`      | `ValidationError`    | Saving a cancelled event                              |
| `toggleSave`      | `UnauthorizedAction` | Only `user` role can save; `staff`/`admin` are rejected |
| `listSavedEvents` | `UnexpectedError`    | Repository failure                                    |

---

## Controller Layer

### IEventController

**File:** `src/event/EventController.ts`
**Depends on:** `IEventService`, `ILoggingService`
**Responsibility:** HTTP handling for event CRUD, lifecycle transitions, filtering, search, and the archive.

```typescript
interface IEventController {
  // Feature 6 + 10 — Event list with filters and search
  showEventList(res: Response, query: EventFilterInput, session: IAppBrowserSession): Promise<void>

  // Feature 2 — Event detail page
  showEventDetail(res: Response, eventId: string, session: IAppBrowserSession): Promise<void>

  // Feature 1 — Create event form and submission
  showCreateForm(res: Response, session: IAppBrowserSession, pageError?: string | null): Promise<void>
  createFromForm(res: Response, input: CreateEventInput, session: IAppBrowserSession): Promise<void>

  // Feature 3 — Edit event form and submission
  showEditForm(res: Response, eventId: string, session: IAppBrowserSession, pageError?: string | null): Promise<void>
  updateFromForm(res: Response, eventId: string, input: UpdateEventInput, session: IAppBrowserSession): Promise<void>

  // Feature 5 — Publish and cancel
  publishEvent(res: Response, eventId: string, session: IAppBrowserSession): Promise<void>
  cancelEvent(res: Response, eventId: string, session: IAppBrowserSession): Promise<void>

  // Feature 11 — Archive page
  showArchive(res: Response, category: string | undefined, session: IAppBrowserSession): Promise<void>

  // Feature 8 — Organizer dashboard
  showOrganizerDashboard(res: Response, session: IAppBrowserSession): Promise<void>
}
```

### IRsvpController

**File:** `src/rsvp/RsvpController.ts`
**Depends on:** `IRsvpService`, `ILoggingService`
**Responsibility:** HTTP handling for RSVP toggling, My RSVPs dashboard, and attendee lists.

```typescript
interface IRsvpController {
  // Feature 4 — Toggle RSVP
  toggleRsvp(res: Response, eventId: string, session: IAppBrowserSession): Promise<void>

  // Feature 7 — My RSVPs dashboard
  showMyRsvps(res: Response, session: IAppBrowserSession): Promise<void>

  // Feature 12 — Attendee list
  showAttendeeList(res: Response, eventId: string, session: IAppBrowserSession): Promise<void>
}
```

### ICommentController

**File:** `src/comment/CommentController.ts`
**Depends on:** `ICommentService`, `ILoggingService`
**Responsibility:** HTTP handling for posting and deleting comments.

```typescript
interface ICommentController {
  // Feature 13 — Post comment
  postComment(res: Response, eventId: string, content: string, session: IAppBrowserSession): Promise<void>

  // Feature 13 — Delete comment
  deleteComment(res: Response, eventId: string, commentId: string, session: IAppBrowserSession): Promise<void>
}
```

### ISavedEventController

**File:** `src/saved/SavedEventController.ts`
**Depends on:** `ISavedEventService`, `ILoggingService`
**Responsibility:** HTTP handling for saving/unsaving events and the saved events list.

```typescript
interface ISavedEventController {
  // Feature 14 — Toggle save
  toggleSave(res: Response, eventId: string, session: IAppBrowserSession): Promise<void>

  // Feature 14 — Saved list page
  showSavedList(res: Response, session: IAppBrowserSession): Promise<void>
}
```

---

## HTTP Routes (Event Board)

All event board routes require authentication. Role restrictions are noted per route.

### Events (Features 1, 2, 3, 5, 6, 10, 11)

| Method | Path                        | Role Required    | Feature | Description                          |
| ------ | --------------------------- | ---------------- | ------- | ------------------------------------ |
| GET    | `/events`                   | any              | 6, 10   | List published events (filterable, searchable) |
| GET    | `/events/new`               | `admin`, `staff` | 1       | Show create event form               |
| POST   | `/events`                   | `admin`, `staff` | 1       | Submit new event (starts as draft)   |
| GET    | `/events/archive`           | any              | 11      | Browse past events                   |
| GET    | `/events/:id`               | any              | 2       | Event detail page                    |
| GET    | `/events/:id/edit`          | `admin`, `staff` | 3       | Show edit event form                 |
| POST   | `/events/:id`               | `admin`, `staff` | 3       | Submit event edits                   |
| POST   | `/events/:id/publish`       | `admin`, `staff` | 5       | Publish a draft event                |
| POST   | `/events/:id/cancel`        | `admin`, `staff` | 5       | Cancel a published event             |

### RSVPs (Features 4, 7, 9, 12)

| Method | Path                        | Role Required    | Feature | Description                          |
| ------ | --------------------------- | ---------------- | ------- | ------------------------------------ |
| POST   | `/events/:id/rsvp`          | `user`           | 4, 9    | Toggle RSVP (handles waitlist + promotion) |
| GET    | `/my/rsvps`                 | `user`           | 7       | My RSVPs dashboard                   |
| GET    | `/events/:id/attendees`     | `admin`, `staff` | 12      | Attendee list for event organizer    |

### Comments (Feature 13)

| Method | Path                                    | Role Required | Feature | Description            |
| ------ | --------------------------------------- | ------------- | ------- | ---------------------- |
| POST   | `/events/:id/comments`                  | any           | 13      | Post a comment         |
| POST   | `/events/:id/comments/:commentId/delete`| any           | 13      | Delete a comment       |

### Saved Events (Feature 14)

| Method | Path                        | Role Required | Feature | Description              |
| ------ | --------------------------- | ------------- | ------- | ------------------------ |
| POST   | `/events/:id/save`          | `user`        | 14      | Toggle save/unsave       |
| GET    | `/my/saved`                 | `user`        | 14      | Saved events list        |

### Dashboards (Feature 8)

| Method | Path                        | Role Required    | Feature | Description                          |
| ------ | --------------------------- | ---------------- | ------- | ------------------------------------ |
| GET    | `/dashboard/events`         | `admin`, `staff` | 8       | Organizer event dashboard            |

---

## Dependency Injection (Full Application)

**File:** `src/composition.ts`

All concrete instances are created and wired in `createComposedApp()`:

```
── Auth (starter) ──────────────────────────────────────────────
IUserRepository      ← InMemoryUserRepository (→ PrismaUserRepository)
IPasswordHasher      ← ScryptPasswordHasher
IAuthService         ← AuthService(IUserRepository, IPasswordHasher)
IAdminUserService    ← AdminUserService(IUserRepository, IPasswordHasher)
IAuthController      ← AuthController(IAuthService, IAdminUserService, ILoggingService)

── Events ──────────────────────────────────────────────────────
IEventRepository     ← InMemoryEventRepository (→ PrismaEventRepository)
IEventService        ← EventService(IEventRepository)
IEventController     ← EventController(IEventService, ILoggingService)

── RSVPs ───────────────────────────────────────────────────────
IRsvpRepository      ← InMemoryRsvpRepository (→ PrismaRsvpRepository)
IRsvpService         ← RsvpService(IRsvpRepository, IEventRepository)
IRsvpController      ← RsvpController(IRsvpService, ILoggingService)

── Comments ────────────────────────────────────────────────────
ICommentRepository   ← InMemoryCommentRepository (→ PrismaCommentRepository)
ICommentService      ← CommentService(ICommentRepository, IEventRepository)
ICommentController   ← CommentController(ICommentService, ILoggingService)

── Saved Events ────────────────────────────────────────────────
ISavedEventRepository ← InMemorySavedEventRepository (→ PrismaSavedEventRepository)
ISavedEventService    ← SavedEventService(ISavedEventRepository, IEventRepository)
ISavedEventController ← SavedEventController(ISavedEventService, ILoggingService)

── Cross-cutting ───────────────────────────────────────────────
ILoggingService      ← LoggingService

── Application ─────────────────────────────────────────────────
IApp ← ExpressApp(
         IAuthController,
         IEventController,
         IRsvpController,
         ICommentController,
         ISavedEventController,
         ILoggingService,
       )
```

Each `InMemory*` repository is replaced with its `Prisma*` counterpart in Sprint 3 of each feature. Only this file changes — no service or controller code is affected.
