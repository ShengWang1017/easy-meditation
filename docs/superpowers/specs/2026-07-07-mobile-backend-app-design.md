# Easy Meditation Mobile And Backend App Design

Date: 2026-07-07

## Goal

Rewrite the current Easy Meditation prototype as a real mobile app with an owned backend. The first production-shaped version should keep the calm, focused breathing experience from the prototype, add email/password accounts, and store user data on the server instead of only in browser local storage.

## Approved Direction

- Mobile app: Expo React Native rewrite, not a Capacitor wrapper.
- Backend: self-hosted TypeScript API with PostgreSQL.
- Identity: email/password registration and login.
- Data ownership: practice records, custom rhythms, user settings, and user-owned state live on the backend.
- Product scope: lightweight breathing and meditation utility, not a course platform, social product, or subscription product.

## Architecture

Use a TypeScript monorepo so mobile, API, and shared contracts evolve together.

```text
easy-meditation/
  apps/
    mobile/        # Expo React Native app
    api/           # Fastify API server
  packages/
    shared/        # shared TypeScript types, Zod schemas, breathing definitions
```

The mobile app owns the real-time breathing session experience. The API owns durable data, authentication, and server-derived summaries. Shared schemas define request and response shapes so the mobile app and API do not drift.

## Tech Stack

### Mobile

- Expo React Native.
- TypeScript.
- Expo Router for navigation.
- TanStack Query for server state.
- Zustand for short-lived app/session state.
- React Hook Form and Zod for login, registration, and settings forms.
- Expo SecureStore for refresh token storage.
- React Native Reanimated for breathing animation.
- Native audio/haptics through Expo APIs where available.

### Backend

- Node.js TypeScript API.
- Fastify for HTTP routing.
- Prisma for database access and migrations.
- PostgreSQL for durable data.
- Zod for request and response validation.
- Password hashing with Argon2id.
- JWT access tokens plus server-stored refresh tokens.

## Backend Modules

### Auth

Responsibilities:

- Register with email and password.
- Login with email and password.
- Issue short-lived access tokens.
- Issue refresh tokens stored in the database as hashed token records.
- Refresh access tokens.
- Revoke refresh tokens on logout.

First version does not include email verification, password reset, social login, or multi-factor authentication.

### Users

Responsibilities:

- Store account identity and profile basics.
- Return the current user through `GET /me`.
- Keep profile minimal: email, optional nickname, creation time.

### Breathing Methods

Responsibilities:

- Store built-in breathing methods as seed data.
- Return method title, subtitle, rhythm phases, default duration, category, sort order, and active flag.
- Let the app render the method list from the backend rather than hardcoding production data in the client.

First version does not require an admin CMS. Seed data can be changed through migrations or seed scripts.

### Custom Rhythms

Responsibilities:

- Store user-created breathing rhythms.
- Support create, update, delete, and list.
- Validate phase durations before saving.

Each custom rhythm belongs to one user.

### Practice Sessions

Responsibilities:

- Store completed or intentionally ended practice sessions.
- Preserve actual practiced seconds, not only planned minutes.
- Store whether the session was completed or ended early.
- Keep enough method snapshot data to make historical records stable even if a method label changes later.

### User Settings

Responsibilities:

- Store default method, default duration, sound preference, haptic preference, and lightweight display preferences.
- Return settings at app start.
- Patch settings independently from profile updates.

### Stats

Responsibilities:

- Derive current streak, weekly practiced seconds, total sessions, total practiced seconds, recent records, and calendar heatmap from `practice_sessions`.
- Avoid premature aggregate tables in the first version.
- Add cached summary tables only if real query volume requires them later.

## Database Tables

### `users`

- `id`: UUID primary key.
- `email`: unique normalized email.
- `password_hash`: hashed password.
- `nickname`: nullable text.
- `created_at`: timestamp.
- `updated_at`: timestamp.

### `refresh_tokens`

- `id`: UUID primary key.
- `user_id`: foreign key to `users`.
- `token_hash`: hashed refresh token.
- `expires_at`: timestamp.
- `revoked_at`: nullable timestamp.
- `created_at`: timestamp.

### `breathing_methods`

- `id`: stable string primary key, such as `box`, `four-seven-eight`, `coherent`.
- `slug`: unique string matching `id` for built-in methods.
- `title`: display title.
- `subtitle`: display subtitle.
- `category`: `classic` or `system`.
- `default_duration_seconds`: integer.
- `phases`: JSON array of `{ kind, label, durationSeconds }`.
- `sort_order`: integer.
- `is_active`: boolean.
- `created_at`: timestamp.
- `updated_at`: timestamp.

### `custom_rhythms`

- `id`: UUID primary key.
- `user_id`: foreign key to `users`.
- `name`: text.
- `inhale_seconds`: integer.
- `hold_seconds`: integer.
- `exhale_seconds`: integer.
- `default_duration_seconds`: integer.
- `created_at`: timestamp.
- `updated_at`: timestamp.
- `deleted_at`: nullable timestamp for soft delete.

### `practice_sessions`

- `id`: UUID primary key.
- `user_id`: foreign key to `users`.
- `method_type`: `built_in` or `custom`.
- `method_id`: nullable built-in method id.
- `custom_rhythm_id`: nullable custom rhythm id.
- `method_title_snapshot`: text.
- `rhythm_snapshot`: JSON array of phase definitions.
- `planned_duration_seconds`: integer.
- `actual_duration_seconds`: integer.
- `completed`: boolean.
- `started_at`: timestamp.
- `ended_at`: timestamp.
- `created_at`: timestamp.

### `user_settings`

- `user_id`: primary key and foreign key to `users`.
- `default_method_type`: `built_in` or `custom`.
- `default_method_id`: nullable text.
- `default_custom_rhythm_id`: nullable UUID.
- `default_duration_seconds`: integer.
- `sound_enabled`: boolean.
- `haptics_enabled`: boolean.
- `created_at`: timestamp.
- `updated_at`: timestamp.

## API Surface

### Public

```text
GET  /health
POST /auth/register
POST /auth/login
POST /auth/refresh
```

### Authenticated

```text
POST /auth/logout
GET  /me

GET  /breathing-methods

GET    /custom-rhythms
POST   /custom-rhythms
PATCH  /custom-rhythms/:id
DELETE /custom-rhythms/:id

GET  /practice-sessions
POST /practice-sessions

GET   /settings
PATCH /settings

GET /stats/summary
```

API responses should use a consistent envelope:

```json
{
  "data": {},
  "error": null
}
```

Validation errors should return field-level details:

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "fields": {
      "email": "Enter a valid email address."
    }
  }
}
```

## Mobile App Structure

```text
apps/mobile/
  app/
    _layout.tsx
    (auth)/
      login.tsx
      register.tsx
    (tabs)/
      practice.tsx
      records.tsx
      settings.tsx
    session/
      [methodType].tsx
    custom-rhythm/
      new.tsx
      [id].tsx
  src/
    api/
      client.ts
      auth.ts
      methods.ts
      rhythms.ts
      sessions.ts
      settings.ts
      stats.ts
    components/
    domain/
      breathing.ts
      sessionClock.ts
    features/
      auth/
      practice/
      records/
      settings/
    store/
      authStore.ts
      sessionStore.ts
    theme/
      tokens.ts
```

## Mobile Screens

### Auth Screens

- Login with email and password.
- Register with email, password, and optional nickname.
- Show calm, low-friction errors.
- Store refresh token in SecureStore after successful login.

### Practice Home

- Render built-in methods and custom rhythms.
- Preserve the prototype's calm card-based training selection.
- Allow quick duration changes.
- Keep the "before you start" guide entry.
- Start a focus session from a selected method.

### Focus Session

- Run the breathing timer locally for smoothness.
- Animate inhale, hold, and exhale with Reanimated.
- Play gentle sound cues when enabled.
- Allow pause, resume, and end.
- On completion or intentional end, submit a practice session to the API.
- If submission fails, put the session into a pending queue and retry later.

### Custom Rhythm

- Let users set inhale, hold, exhale, and target duration.
- Save custom rhythms to the API.
- Reuse the same validation rules in mobile and API through shared schemas.

### Records

- Show current streak, weekly duration, total sessions, recent records, and calendar heatmap.
- Fetch summary from `GET /stats/summary`.
- Fetch paginated records from `GET /practice-sessions`.

### Settings

- Sound toggle.
- Haptics toggle.
- Default method and duration.
- Logout.
- Account email display.

## Mobile Data Flow

```text
Open app
  -> read refresh token from SecureStore
  -> no token: show auth flow
  -> token exists: call /auth/refresh
  -> fetch /me, /breathing-methods, /custom-rhythms, /settings, /stats/summary
  -> show Practice Home
  -> run session locally
  -> POST /practice-sessions on completion or intentional end
  -> invalidate stats and records queries
```

## Local Cache And Offline Behavior

- Server remains the source of truth.
- TanStack Query caches methods, custom rhythms, settings, stats, and recent sessions.
- The active breathing timer is local-only and does not sync mid-session.
- Failed practice-session submissions are stored in a local pending queue.
- Pending submissions retry when the app returns online or launches again.
- Custom rhythm edits require network in the first version; offline editing can come later.

## Shared Package

`packages/shared` should contain:

- `BreathingPhase` type.
- `BreathingMethod` type.
- `PracticeSession` request and response schemas.
- `CustomRhythm` request and response schemas.
- `UserSettings` schemas.
- Auth request schemas.
- Timer helpers that are safe to share between Node and React Native.

The existing prototype domain logic can guide the shared breathing model, but the mobile rewrite should not import the browser UI code.

## Error Handling

### Auth Errors

- Invalid email/password returns a generic login error.
- Duplicate registration email returns a field error.
- Expired refresh token clears auth state and returns the user to login.

### Practice Submission Errors

- Network failure stores the session in the pending queue.
- Validation failure shows a non-blocking error and keeps the session visible in local pending state.
- Server failure retries with backoff and avoids duplicate records by sending an idempotency key.

### Settings And Rhythm Errors

- Invalid rhythm values are blocked before API submission.
- API validation errors map back to form fields.
- Delete operations should be reversible only through re-creation in the first version; no restore UI is required.

## Security And Privacy

- Never store plaintext passwords.
- Store only refresh tokens in SecureStore; keep access tokens short-lived.
- Hash refresh tokens in the database.
- Scope every user-owned query by authenticated `user_id`.
- Do not log passwords, tokens, or full authorization headers.
- Keep practice data private to the authenticated user.

## Testing Strategy

### Backend

- Unit tests for auth token service, password hashing boundary, stats derivation, and validation schemas.
- Integration tests for each API route against a test database.
- Migration test that seeds built-in breathing methods.
- Authorization tests proving users cannot read or mutate another user's data.

### Mobile

- Unit tests for breathing timer helpers and session state.
- Component tests for login, practice home, custom rhythm form, and records summary.
- API mocking tests for happy path and failure path.
- Manual device checks for session animation, sound, haptics, auth persistence, and pending submission retry.

### Shared

- Schema tests proving mobile request payloads match API expectations.
- Timer tests ported from the current prototype's breathing tests.

## Migration From Current Prototype

Reuse as reference:

- Breathing method definitions and phase timing rules.
- Current practice state tests.
- Records/statistics expectations.
- Visual direction, assets, and low-stimulation interaction style.

Do not directly carry over:

- Browser-only localStorage persistence as the production data layer.
- DOM rendering code.
- Web Audio implementation.
- Static `index.html` app shell.

## First Implementation Milestone

The first milestone is a vertical slice:

1. Monorepo scaffold.
2. API with auth, current user, built-in methods, and one protected route.
3. Mobile auth flow.
4. Mobile method list loaded from API.
5. One breathing session can run locally.
6. Completed session posts to backend.
7. Records summary updates from backend.

This milestone proves the core product loop end to end before expanding settings, custom rhythm editing, and offline retry.

## Out Of Scope For First Version

- Phone/SMS login.
- Social login.
- Email verification and password reset.
- Course library.
- Guided voice content.
- Subscription, paywall, or billing.
- Community or sharing.
- Admin CMS.
- Push notifications.
- Cross-device live session sync.
- Apple Watch or wearable integrations.

## Acceptance Criteria

- A new user can register with email and password.
- A returning user can log in and remain authenticated across app launches.
- The app fetches breathing methods from the backend.
- The app can run a breathing session locally with smooth phase timing.
- Completing or ending a session creates a backend `practice_sessions` record.
- Records and stats reflect server data after submission.
- A user cannot access another user's rhythms, settings, or sessions.
- The mobile UI preserves the current calm breathing-product direction.
- The backend and mobile app share schemas for auth, custom rhythms, practice sessions, settings, and stats.
- The first milestone can be tested locally with one API server, one PostgreSQL database, and one Expo dev client.
