# Team 11 Event Board _(team-11-event-board)_

A server-rendered web app for posting, browsing, and RSVPing to events, with role-based access.

Team 11 Event Board lets staff create and publish events, and lets any signed-in user search events, RSVP, save events for later, and comment. It has three roles (admin, staff, and user), HTTPS in development, and server-side sessions. It is built with TypeScript, Express 5, EJS, HTMX, Alpine.js, Tailwind CSS, and Prisma with SQLite. The project began from a team starter template that provided authentication, authorization, HTTPS, and session management, and the event, comment, and saved-event features were built on top of it by Team 11.

## Table of Contents

- [Security](#security)
- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Features](#features)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [API](#api)
- [Maintainers](#maintainers)
- [Thanks](#thanks)
- [Contributing](#contributing)
- [License](#license)

## Security

- **Self-signed certificates.** The certificates in `certs/` are for local development only. Browsers will show a warning, which is expected locally. Use real certificates in production.
- **Session secret.** The default `SESSION_SECRET` is a demo value. Set your own secret outside local development.
- **Demo accounts.** The demo users share a known password (`password123`) and are stored in memory. Do not use them in production.
- **Passwords.** Passwords are hashed with Node.js scrypt and compared in a timing-safe way. Passwords are never stored in the session.

## Background

Campus and community groups often announce events in scattered places, which makes them hard to find and hard to manage. This project gathers events into one board where organizers can publish and manage them and attendees can find, RSVP to, save, and discuss them.

The app follows a layered design. Each feature has a model, a repository, a service, and a controller. Services return a `Result<T, E>` value instead of throwing exceptions, and `composition.ts` wires all dependencies together in one place so implementations are easy to swap and test.

The authentication and session layer came from the team starter template. The event, comment, and saved-event features are Team 11's work.

## Install

```bash
git clone https://github.com/linqikuang1/team-11-event-board.git
cd team-11-event-board
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` in place of `cp`.

### Dependencies

- [Node.js](https://nodejs.org) and npm. Use a current LTS release.
- No separate database server is needed. The app uses SQLite through Prisma, and `npx prisma migrate dev` creates the database file and tables. If you skip this step, pages that list events fail with the error "The table `main.Event` does not exist."

### Environment variables

Set these in `.env`. All are optional except `DATABASE_URL`, which Prisma commands need.

| Variable | Default | Description |
| --- | --- | --- |
| `HTTPS_PORT` | `3443` | HTTPS port |
| `HTTP_REDIRECT_PORT` | `3000` | HTTP-to-HTTPS redirect port |
| `HTTPS_KEY_PATH` | `./certs/localhost-key.pem` | TLS private key |
| `HTTPS_CERT_PATH` | `./certs/localhost-cert.pem` | TLS certificate |
| `DATABASE_URL` | `file:./prisma/dev.db` | SQLite database path |
| `SESSION_SECRET` | `project-starter-demo-secret` | Session signing secret |

## Usage

```bash
npm run dev
```

Open <https://localhost:3443> and accept the browser's certificate warning. Requests to `http://localhost:3000` redirect to HTTPS.

Sign in with a demo account. The password for all of them is `password123`.

| Email | Role | What they can do |
| --- | --- | --- |
| `admin@app.test` | admin | Everything staff can do, plus create and delete users at `/admin/users` |
| `staff@app.test` | staff | Create, edit, publish, cancel, and delete events, and view attendee lists |
| `user@app.test` | user | Browse, search, and filter events, RSVP, save events, and comment |

Demo users are stored in memory and reset whenever the server restarts. After signing in, you land on the events page.

### Common tasks

- **Find events:** open Events, then use the search box and the category and timeframe filters.
- **RSVP:** open an event and click RSVP. Click again to cancel.
- **Save an event:** click Save on an event, then view your list under Saved.
- **Comment:** open an event and add a comment.
- **Create an event (staff or admin):** open Create Event and enter a title, description, location, start time, and end time. Capacity and tags (comma-separated) are optional.
- **Publish or cancel an event (staff or admin):** new events start as drafts. Publish one to make it visible, and cancel a published event if plans change.
- **Manage users (admin):** go to `/admin/users`.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Build TypeScript and start the HTTPS server |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Run the Jest test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npx prisma migrate dev` | Create and apply a database migration |

## Features

- Event search with category and timeframe filters, updated in place with HTMX.
- Event lifecycle: draft, published, and cancelled.
- RSVP to events, with attendee lists for organizers.
- Save events and view them on a personal Saved page.
- Comments on events.
- Archive of past events, filterable by category.
- Admin user management.
- Role-based access for admin, staff, and user.

## Project Structure

```
team-11-event-board/
├── src/
│   ├── auth/          # Authentication, authorization, and user management
│   ├── events/        # Event model, repository, service, and controller
│   ├── comments/      # Comment feature
│   ├── saved/         # Saved-event feature
│   ├── lib/           # Shared helpers, including the Result type
│   ├── service/       # Logging
│   ├── session/       # Session management
│   ├── views/         # EJS templates and layouts
│   ├── static/        # Static assets
│   ├── app.ts         # Express setup, middleware, and routes
│   ├── composition.ts # Dependency wiring
│   └── server.ts      # HTTPS server with HTTP redirect
├── test/              # Jest tests
├── prisma/            # Database schema and migrations
├── certs/             # Self-signed development certificates
└── package.json
```

## Testing

```bash
npm test
```

Tests use Jest with ts-jest and supertest.

## API

The app is server-rendered, so most routes return HTML pages. Some routes return small HTML fragments for HTMX, which updates part of a page without a full reload. Access levels are Public, Authenticated (any signed-in user), or staff and admin.

### General and authentication

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | Redirects to `/home` if signed in, otherwise to `/login` |
| GET | `/home` | Authenticated | Redirects to `/events` |
| GET | `/login` | Public | Login page, or redirects to `/home` if already signed in |
| POST | `/login` | Public | Submit `email` and `password` |
| POST | `/logout` | Public | End the session |

### Admin

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| GET | `/admin/users` | admin | List users |
| POST | `/admin/users` | admin | Create a user from `email`, `displayName`, `password`, and `role` (defaults to `user`) |
| POST | `/admin/users/:id/delete` | admin | Delete a user |

### Browsing events

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| GET | `/events` | Authenticated | Events page. Query parameters: `q`, `category`, `timeframe` (default `all`) |
| GET | `/events/search` | Authenticated | Filtered results as an HTMX fragment |
| GET | `/events/archive` | Authenticated | Archive page. Query parameter: `category` |
| GET | `/events/archive/filter` | Authenticated | Filtered archive as an HTMX fragment |
| GET | `/events/:id` | Authenticated | Event detail page |

### Attendee actions

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| POST | `/events/:id/rsvp` | Authenticated | Toggle your RSVP |
| POST | `/events/:id/save` | Authenticated | Toggle saving the event |
| GET | `/saved` | Authenticated | List your saved events |

### Organizer actions

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| GET | `/events/create` | staff, admin | Create form |
| POST | `/events/create` | staff, admin | Create an event from `title`, `description`, `location`, `startTime`, `endTime`, and optional `capacity` and `tags` (comma-separated) |
| GET | `/events/:id/edit` | staff, admin | Edit form |
| POST | `/events/:id/edit` | staff, admin | Update an event using the same fields as create |
| POST | `/events/:id/publish` | staff, admin | Move an event from draft to published |
| POST | `/events/:id/cancel` | staff, admin | Move a published event to cancelled |
| POST | `/events/:id/delete` | staff, admin | Delete an event |
| GET | `/events/:id/attendees` | staff, admin | Attendee list (also available as an HTMX fragment) |

Staff can only publish and cancel their own events, while admins can act on any event. The service layer enforces this.

### Comments

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| GET | `/events/:id/comments` | Authenticated | List comments for an event |
| POST | `/events/:id/comments` | Authenticated | Post a comment using the `content` field |
| POST | `/events/:id/comments/:commentId/delete` | Authenticated | Delete a comment |

### Errors

- **Not signed in:** page requests redirect to `/login`. Form posts and HTMX requests receive a 401 error message.
- **Wrong role:** a 403 error message explains the restriction.
- **Unexpected failure:** a 500 error message is shown.

## Maintainers

- [@linqikuang1](https://github.com/linqikuang1)
- [@arioyu-0001] (https://github.com/arioyu-0001)
- [@GUIdance0] (https://github.com/GUIdance0)
- [@Praptipatel101] (https://github.com/Praptipatel101)
- [@Soumith-Madadi] (https://github.com/Soumith-Madadi)

## Thanks

- The team starter template, which provided the authentication, session, and HTTPS foundation.
- The authors of Express, EJS, HTMX, Alpine.js, Tailwind CSS, and Prisma.

## Contributing

Questions and bug reports are welcome in the [GitHub issues](https://github.com/linqikuang1/team-11-event-board/issues).

[Pull requests are accepted / This is a course project, so pull requests are limited to Team 11 members.] Please run `npm test` before submitting changes and describe what you changed and why.

## License

UNLICENSED © Team 11
