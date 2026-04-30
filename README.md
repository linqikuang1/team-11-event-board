# Project Starter

A starter application for team projects that provides authentication, role-based authorization, HTTPS, and session management out of the box. Your team can focus on building project features instead of reimplementing auth infrastructure.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Environment (required for Prisma CLI: generate, migrate)
#    Copy and edit, or set DATABASE_URL yourself.
cp .env.example .env

# 3. Generate the Prisma client
npx prisma generate

# 4. Build and run
npm run dev
```

The app starts on **https://localhost:3443**. Your browser will show a certificate warning because the included certs are self-signed, this is expected for local development. Accept the warning to proceed.

An HTTP server on port 3000 automatically redirects to HTTPS.

## Demo Users

Three demo accounts are available out of the box. All passwords are `password123`.

| Email            | Display Name | Role    |
| ---------------- | ------------ | ------- |
| `admin@app.test` | Avery Admin  | `admin` |
| `staff@app.test` | Sam Staff    | `staff` |
| `user@app.test`  | Una User     | `user`  |

These users are stored in memory with pre-hashed passwords (scrypt). They reset every time the server restarts.

## Authorization Roles

The starter enforces three roles with different permission levels:

- **Admin** -> Full access. Can manage users (create/delete) via `/admin/users`.
- **Staff** -> Authenticated access to all non-admin pages.
- **User** -> Authenticated read-only access.

Use the `requireAuthenticated` and `requireRole` helper methods in `src/app.ts` to protect your own routes.

## Project Structure

```
project-starter/
├── src/
│   ├── auth/                    # Authentication & authorization (do not modify)
│   │   ├── AdminUserService.ts  #   Admin user management (create/delete users)
│   │   ├── AuthController.ts    #   HTTP handlers for login/logout/user management
│   │   ├── AuthService.ts       #   Core authentication logic (verify credentials)
│   │   ├── InMemoryUserRepository.ts  # Demo user storage with hashed passwords
│   │   ├── PasswordHasher.ts    #   Scrypt password hashing with timing-safe comparison
│   │   ├── User.ts              #   User model types and role definitions
│   │   ├── UserRepository.ts    #   User storage interface
│   │   └── errors.ts            #   Auth-specific error types
│   ├── lib/
│   │   └── result.ts            # Generic Result<T, E> type for error handling
│   ├── service/
│   │   └── LoggingService.ts    # Simple timestamped logging
│   ├── session/
│   │   └── AppSession.ts        # Session management (browser tracking + auth state)
│   ├── views/
│   │   ├── auth/
│   │   │   ├── login.ejs        # Login page
│   │   │   ├── users.ejs        # Admin user management page
│   │   │   └── partials/error.ejs
│   │   ├── layouts/
│   │   │   └── base.ejs         # Master layout with navigation bar
│   │   ├── partials/
│   │   │   └── error.ejs        # Shared error banner partial
│   │   └── home.ejs             # Placeholder home page (replace with your own)
│   ├── static/                  # Static assets directory (create to add your own)
│   ├── app.ts                   # Express app setup, middleware, and route registration
│   ├── composition.ts           # Dependency injection / wiring
│   ├── contracts.ts             # IApp and IServer interfaces
│   └── server.ts                # HTTPS server startup with HTTP redirect
├── test/
│   ├── auth/
│   │   ├── AuthService.test.ts  # Authentication tests
│   │   └── AdminUserService.test.ts  # Admin user management tests
│   └── smoke.test.ts            # Basic Result type tests
├── prisma/
│   └── schema.prisma            # Database schema (add your models here)
├── certs/                       # Self-signed HTTPS certificates for development
├── .env                         # Environment variables
├── package.json
├── tsconfig.json
└── jest.config.cjs
```

## Where to Start Building

### 1. Define Your Data Model

Edit `prisma/schema.prisma` to add your project's database tables, then run:

```bash
npx prisma migrate dev --name your-migration-name
```

### 2. Create Your Service and Repository Layers

Follow the existing patterns in `src/auth/` as a reference:

- **Model** -> Define TypeScript types for your data (like `src/auth/User.ts`).
- **Repository** -> Create a storage interface and implementation (like `UserRepository.ts` and `InMemoryUserRepository.ts`). You can start with an in-memory implementation and swap to Prisma later.
- **Service** -> Write business logic that validates input and delegates to the repository (like `AuthService.ts`). Use the `Result<T, E>` type from `src/lib/result.ts` for error handling.

### 3. Create Controllers

Build HTTP handlers that translate between web requests and your service layer (like `AuthController.ts`). Controllers handle request parsing, call services, and render views.

### 4. Add Routes

Register your routes in `src/app.ts` inside the `registerRoutes` method. Use the built-in auth helpers:

```typescript
// Require any authenticated user
this.app.get(
  '/your-page',
  asyncHandler(async (req, res) => {
    if (!this.requireAuthenticated(req, res)) return
    // ... your handler logic
  })
)

// Require specific roles
this.app.post(
  '/admin-action',
  asyncHandler(async (req, res) => {
    if (
      !this.requireRole(
        req,
        res,
        ['admin', 'staff'],
        'Insufficient permissions.'
      )
    )
      return
    // ... your handler logic
  })
)
```

### 5. Create Views

Add EJS templates in `src/views/`. The master layout (`layouts/base.ejs`) provides the navigation bar and page shell automatically. Your views just need to provide the page content.

### 6. Wire It Together

Update `src/composition.ts` to instantiate and inject your new services, repositories, and controllers. Pass your controller(s) to `CreateApp`.

## Available Scripts

| Script                   | Description                                   |
| ------------------------ | --------------------------------------------- |
| `npm run dev`            | Build TypeScript and start the HTTPS server   |
| `npm run build`          | Compile TypeScript to `dist/`                 |
| `npm test`               | Run the test suite with Jest                  |
| `npm run test:watch`     | Run tests in watch mode                       |
| `npx prisma generate`    | Regenerate Prisma client after schema changes |
| `npx prisma migrate dev` | Create and apply a database migration         |

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express 5
- **Templating**: EJS with express-ejs-layouts
- **CSS**: Tailwind CSS v4 (via CDN)
- **Frontend Interactivity**: Alpine.js 3 + HTMX 2.0
- **Database**: SQLite via Prisma ORM
- **Password Hashing**: Node.js scrypt (timing-safe)
- **Sessions**: express-session (in-memory, server-side)
- **Transport Security**: HTTPS with self-signed certificates
- **Testing**: Jest with ts-jest and supertest

### Tailwind CSS

Tailwind CSS v4 is loaded via the [Play CDN](https://tailwindcss.com/docs/installation/play-cdn), which means no build step is required. Just use Tailwind utility classes directly in your EJS templates. The CDN approach is ideal for development and prototyping.

### Alpine.js

[Alpine.js](https://alpinejs.dev/) is included via CDN for lightweight client-side interactivity. Use directives like `x-data`, `x-show`, `x-bind`, `@click`, and `x-transition` directly in your HTML. The home page includes a working demo. Alpine.js works great alongside HTMX, use Alpine for client-side UI state and HTMX for server-driven updates.

## Architecture Concepts

### Result Type

All services use a functional `Result<T, E>` type instead of throwing exceptions. Every service method returns either `Ok(value)` for success or `Err(error)` for failure. This keeps error handling explicit and composable.

```typescript
import { Ok, Err, type Result } from './lib/result'

async function doSomething(): Promise<Result<string, MyError>> {
  if (somethingWrong) return Err({ name: 'BadInput', message: '...' })
  return Ok('success')
}
```

### Dependency Injection

The `composition.ts` file wires all dependencies together in one place. This makes it easy to swap implementations (e.g., in-memory storage to database-backed) and to inject test doubles in your tests.

### Session Management

Sessions track browser identity and authentication state. The `AppSession` module provides helper functions for reading/writing session data without touching the raw session object directly. Passwords are never stored in the session, only the authenticated user's identity and role.

### HTTPS

The app runs over HTTPS even in development. Self-signed certificates in `certs/` are provided for convenience. In production, use real certificates.

## Environment Variables

| Variable             | Default                       | Description                |
| -------------------- | ----------------------------- | -------------------------- |
| `HTTPS_PORT`         | `3443`                        | HTTPS listener port        |
| `HTTP_REDIRECT_PORT` | `3000`                        | HTTP → HTTPS redirect port |
| `HTTPS_KEY_PATH`     | `./certs/localhost-key.pem`   | Path to TLS private key    |
| `HTTPS_CERT_PATH`    | `./certs/localhost-cert.pem`  | Path to TLS certificate    |
| `DATABASE_URL`       | `file:./prisma/dev.db`        | SQLite database path       |
| `SESSION_SECRET`     | `project-starter-demo-secret` | Session signing secret     |
