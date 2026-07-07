# Mobile Backend Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first end-to-end Easy Meditation production slice: email/password auth, API-backed breathing methods, an Expo mobile auth flow, one local breathing session, backend session persistence, and server-derived records summary.

**Architecture:** Use an npm-workspaces TypeScript monorepo with `apps/api`, `apps/mobile`, and `packages/shared`. The API uses Fastify, Prisma, PostgreSQL, Argon2id password hashing, and JWT access tokens with hashed refresh tokens. The mobile app uses Expo React Native, Expo Router, TanStack Query, Zustand, SecureStore, and shared schemas for API contracts.

**Tech Stack:** npm workspaces, TypeScript, Zod, Vitest, Fastify, Prisma, PostgreSQL, Argon2id, JWT, Expo React Native, Expo Router, TanStack Query, Zustand, Expo SecureStore, React Native Reanimated.

## Global Constraints

- Mobile app: Expo React Native rewrite, not a Capacitor wrapper.
- Backend: self-hosted TypeScript API with PostgreSQL.
- Identity: email/password registration and login.
- Data ownership: practice records, custom rhythms, user settings, and user-owned state live on the backend.
- Product scope: lightweight breathing and meditation utility, not a course platform, social product, or subscription product.
- Password hashing with Argon2id.
- JWT access tokens plus server-stored refresh tokens.
- Server remains the source of truth.
- The backend and mobile app share schemas for auth, custom rhythms, practice sessions, settings, and stats.
- First milestone proves the core product loop end to end before expanding settings, custom rhythm editing, and offline retry.

---

## Scope Boundary

This plan implements the first implementation milestone from the approved spec:

1. Monorepo scaffold.
2. API with auth, current user, built-in methods, and one protected route.
3. Mobile auth flow.
4. Mobile method list loaded from API.
5. One breathing session can run locally.
6. Completed session posts to backend.
7. Records summary updates from backend.

This plan deliberately does not implement custom rhythm editing, settings editing, password reset, email verification, push notifications, admin CMS, or full offline retry. Those should be separate follow-up plans after this vertical slice is verified.

## File Structure

- Create `package.json`: root npm workspace scripts.
- Create `tsconfig.base.json`: shared strict TypeScript config.
- Modify `.gitignore`: add monorepo build, env, Expo, and Prisma generated artifacts.
- Create `docker-compose.yml`: local PostgreSQL service.
- Create `packages/shared/package.json`: shared package metadata.
- Create `packages/shared/tsconfig.json`: shared package TS config.
- Create `packages/shared/vitest.config.ts`: shared package test config.
- Create `packages/shared/src/index.ts`: shared exports.
- Create `packages/shared/src/schemas.ts`: Zod API contracts and exported types.
- Create `packages/shared/src/breathing.ts`: breathing timing helpers.
- Create `packages/shared/src/breathing.test.ts`: shared timer tests.
- Create `apps/api/package.json`: API scripts and dependencies.
- Create `apps/api/tsconfig.json`: API TypeScript config.
- Create `apps/api/vitest.config.ts`: API test config.
- Create `apps/api/.env.example`: API environment template.
- Create `apps/api/prisma/schema.prisma`: PostgreSQL schema.
- Create `apps/api/prisma/seed.ts`: built-in method seed data.
- Create `apps/api/src/env.ts`: typed environment loader.
- Create `apps/api/src/db.ts`: Prisma client singleton.
- Create `apps/api/src/app.ts`: Fastify app builder.
- Create `apps/api/src/server.ts`: local server entrypoint.
- Create `apps/api/src/plugins/auth.ts`: authenticated request plugin.
- Create `apps/api/src/modules/auth/auth.service.ts`: password/token service.
- Create `apps/api/src/modules/auth/auth.routes.ts`: auth routes.
- Create `apps/api/src/modules/methods/methods.routes.ts`: built-in method route.
- Create `apps/api/src/modules/sessions/sessions.routes.ts`: practice session route.
- Create `apps/api/src/modules/stats/stats.service.ts`: stats derivation.
- Create `apps/api/src/modules/stats/stats.routes.ts`: stats route.
- Create `apps/api/src/modules/me/me.routes.ts`: current user route.
- Create `apps/api/src/test/app.test.ts`: API vertical slice tests.
- Create `apps/mobile/package.json`: Expo app metadata and dependencies.
- Create `apps/mobile/app.json`: Expo config.
- Create `apps/mobile/babel.config.js`: Expo/Reanimated Babel config.
- Create `apps/mobile/tsconfig.json`: mobile TypeScript config.
- Create `apps/mobile/app/_layout.tsx`: root navigation and providers.
- Create `apps/mobile/app/(auth)/login.tsx`: login screen.
- Create `apps/mobile/app/(auth)/register.tsx`: register screen.
- Create `apps/mobile/app/(tabs)/_layout.tsx`: tab navigation.
- Create `apps/mobile/app/(tabs)/practice.tsx`: method list screen.
- Create `apps/mobile/app/(tabs)/records.tsx`: summary screen.
- Create `apps/mobile/app/session/[methodId].tsx`: focus session screen.
- Create `apps/mobile/src/api/client.ts`: API client.
- Create `apps/mobile/src/api/auth.ts`: auth API functions.
- Create `apps/mobile/src/api/methods.ts`: method API functions.
- Create `apps/mobile/src/api/sessions.ts`: session API functions.
- Create `apps/mobile/src/api/stats.ts`: stats API functions.
- Create `apps/mobile/src/components/Screen.tsx`: shared screen layout.
- Create `apps/mobile/src/domain/sessionClock.ts`: mobile session state helper.
- Create `apps/mobile/src/domain/sessionClock.test.ts`: session helper tests.
- Create `apps/mobile/src/store/authStore.ts`: token storage and auth state.
- Create `apps/mobile/src/theme/tokens.ts`: visual tokens from the prototype direction.

---

### Task 1: Root Monorepo And Shared Contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Modify: `.gitignore`
- Create: `docker-compose.yml`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/breathing.ts`
- Create: `packages/shared/src/breathing.test.ts`

**Interfaces:**
- Consumes: approved spec in `docs/superpowers/specs/2026-07-07-mobile-backend-app-design.md`.
- Produces:
  - `@easy-meditation/shared` package.
  - `BREATHING_METHODS_SEED: BreathingMethod[]`.
  - `getSessionSnapshot(method, elapsedSeconds, totalSeconds): SessionSnapshot`.
  - Zod schemas exported from `packages/shared/src/schemas.ts`.

- [ ] **Step 1: Create root workspace files**

Create `package.json`:

```json
{
  "name": "easy-meditation-workspace",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "dev:api": "npm --workspace apps/api run dev",
    "dev:mobile": "npm --workspace apps/mobile run start",
    "db:up": "docker compose up -d postgres",
    "db:down": "docker compose down"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "resolveJsonModule": true
  }
}
```

Update `.gitignore` so it contains the existing entries plus:

```gitignore
node_modules/
dist/
.env
.env.*
!.env.example
.expo/
.expo-shared/
coverage/
apps/api/prisma/generated/
```

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: easy_meditation
      POSTGRES_USER: easy_meditation
      POSTGRES_PASSWORD: easy_meditation
    volumes:
      - easy_meditation_pg:/var/lib/postgresql/data

volumes:
  easy_meditation_pg:
```

- [ ] **Step 2: Create shared package metadata**

Create `packages/shared/package.json`:

```json
{
  "name": "@easy-meditation/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "module": "NodeNext"
  },
  "include": ["src"]
}
```

Create `packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true
  }
});
```

- [ ] **Step 3: Write failing shared tests**

Create `packages/shared/src/breathing.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { BREATHING_METHODS_SEED, getSessionSnapshot, secondsToTimerLabel } from './breathing.js';

describe('shared breathing helpers', () => {
  test('seeds built-in breathing methods with stable ids', () => {
    expect(BREATHING_METHODS_SEED.map((method) => method.id)).toEqual([
      'box',
      'four-seven-eight',
      'coherent'
    ]);
  });

  test('calculates box breathing phases', () => {
    const method = BREATHING_METHODS_SEED[0];

    expect(getSessionSnapshot(method, 0, 180)).toMatchObject({ label: '吸气', remainingInPhase: 4 });
    expect(getSessionSnapshot(method, 4, 180)).toMatchObject({ label: '屏息', remainingInPhase: 4 });
    expect(getSessionSnapshot(method, 8, 180)).toMatchObject({ label: '呼气', remainingInPhase: 4 });
    expect(getSessionSnapshot(method, 12, 180)).toMatchObject({ label: '屏息', remainingInPhase: 4 });
  });

  test('marks completion exactly at total duration', () => {
    const method = BREATHING_METHODS_SEED[1];

    expect(getSessionSnapshot(method, 120, 120)).toMatchObject({
      kind: 'complete',
      label: '完成',
      isComplete: true,
      remainingInSession: 0
    });
  });

  test('formats timer labels', () => {
    expect(secondsToTimerLabel(180)).toBe('03:00');
    expect(secondsToTimerLabel(61)).toBe('01:01');
    expect(secondsToTimerLabel(5)).toBe('00:05');
  });
});
```

- [ ] **Step 4: Run test to verify RED**

Run: `npm install`

Expected: installs workspace dependencies and creates `package-lock.json`.

Run: `npm --workspace packages/shared run test`

Expected: FAIL because `packages/shared/src/breathing.ts` does not exist.

- [ ] **Step 5: Implement shared schemas and breathing helpers**

Create `packages/shared/src/schemas.ts`:

```ts
import { z } from 'zod';

export const phaseKindSchema = z.enum(['inhale', 'hold', 'exhale']);

export const breathingPhaseSchema = z.object({
  kind: phaseKindSchema,
  label: z.string().min(1),
  durationSeconds: z.number().int().min(1).max(60)
});

export const breathingMethodSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  category: z.enum(['classic', 'system']),
  defaultDurationSeconds: z.number().int().min(60).max(3600),
  phases: z.array(breathingPhaseSchema).min(1),
  sortOrder: z.number().int(),
  isActive: z.boolean()
});

export const authRegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  nickname: z.string().trim().min(1).max(40).optional()
});

export const authLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128)
});

export const tokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1)
});

export const meSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  nickname: z.string().nullable(),
  createdAt: z.string()
});

export const practiceSessionCreateSchema = z.object({
  clientSessionId: z.string().uuid(),
  methodType: z.enum(['built_in', 'custom']),
  methodId: z.string().min(1).nullable(),
  customRhythmId: z.string().uuid().nullable(),
  methodTitleSnapshot: z.string().min(1),
  rhythmSnapshot: z.array(breathingPhaseSchema).min(1),
  plannedDurationSeconds: z.number().int().min(1).max(24 * 60 * 60),
  actualDurationSeconds: z.number().int().min(1).max(24 * 60 * 60),
  completed: z.boolean(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime()
});

export const practiceSessionSchema = practiceSessionCreateSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string()
});

export const statsSummarySchema = z.object({
  totalSessions: z.number().int().min(0),
  totalPracticeSeconds: z.number().int().min(0),
  weeklyPracticeSeconds: z.number().int().min(0),
  currentStreak: z.number().int().min(0),
  recentSessions: z.array(practiceSessionSchema).max(10)
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string()).optional()
});

export function dataEnvelope<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    data: schema,
    error: z.null()
  });
}

export type BreathingPhase = z.infer<typeof breathingPhaseSchema>;
export type BreathingMethod = z.infer<typeof breathingMethodSchema>;
export type AuthRegisterInput = z.infer<typeof authRegisterSchema>;
export type AuthLoginInput = z.infer<typeof authLoginSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
export type Me = z.infer<typeof meSchema>;
export type PracticeSessionCreateInput = z.infer<typeof practiceSessionCreateSchema>;
export type PracticeSession = z.infer<typeof practiceSessionSchema>;
export type StatsSummary = z.infer<typeof statsSummarySchema>;
```

Create `packages/shared/src/breathing.ts`:

```ts
import type { BreathingMethod } from './schemas.js';

export type BreathPhaseKind = 'inhale' | 'hold' | 'exhale' | 'complete';

export type SessionSnapshot = {
  kind: BreathPhaseKind;
  label: string;
  phaseIndex: number;
  phaseProgress: number;
  remainingInPhase: number;
  remainingInSession: number;
  elapsedSeconds: number;
  isComplete: boolean;
};

export const BREATHING_METHODS_SEED: BreathingMethod[] = [
  {
    id: 'box',
    slug: 'box',
    title: '盒式呼吸',
    subtitle: '吸气 · 屏息 · 呼气 · 屏息',
    category: 'classic',
    defaultDurationSeconds: 180,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 4 },
      { kind: 'exhale', label: '呼气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 4 }
    ],
    sortOrder: 10,
    isActive: true
  },
  {
    id: 'four-seven-eight',
    slug: 'four-seven-eight',
    title: '4-7-8 呼吸',
    subtitle: '吸气 4 秒 · 屏息 7 秒 · 呼气 8 秒',
    category: 'classic',
    defaultDurationSeconds: 180,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 7 },
      { kind: 'exhale', label: '呼气', durationSeconds: 8 }
    ],
    sortOrder: 20,
    isActive: true
  },
  {
    id: 'coherent',
    slug: 'coherent',
    title: '共振呼吸',
    subtitle: '吸气 5 秒 · 呼气 5 秒',
    category: 'classic',
    defaultDurationSeconds: 300,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 5 },
      { kind: 'exhale', label: '呼气', durationSeconds: 5 }
    ],
    sortOrder: 30,
    isActive: true
  }
];

export function getSessionSnapshot(
  method: BreathingMethod,
  elapsedSeconds: number,
  totalSeconds: number
): SessionSnapshot {
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  const total = Math.max(1, Math.floor(totalSeconds));

  if (elapsed >= total) {
    return {
      kind: 'complete',
      label: '完成',
      phaseIndex: Math.max(0, method.phases.length - 1),
      phaseProgress: 1,
      remainingInPhase: 0,
      remainingInSession: 0,
      elapsedSeconds: total,
      isComplete: true
    };
  }

  const cycleSeconds = method.phases.reduce((sum, phase) => sum + phase.durationSeconds, 0);
  let cycleElapsed = elapsed % cycleSeconds;
  const remainingInSession = total - elapsed;

  for (let index = 0; index < method.phases.length; index += 1) {
    const phase = method.phases[index];
    if (!phase) break;

    if (cycleElapsed < phase.durationSeconds) {
      const remainingInPhase = phase.durationSeconds - cycleElapsed;
      return {
        kind: phase.kind,
        label: phase.label,
        phaseIndex: index,
        phaseProgress: cycleElapsed / phase.durationSeconds,
        remainingInPhase: Math.min(remainingInPhase, remainingInSession),
        remainingInSession,
        elapsedSeconds: elapsed,
        isComplete: false
      };
    }

    cycleElapsed -= phase.durationSeconds;
  }

  return getSessionSnapshot(method, total, total);
}

export function secondsToTimerLabel(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
```

Create `packages/shared/src/index.ts`:

```ts
export * from './schemas.js';
export * from './breathing.js';
```

- [ ] **Step 6: Run shared tests and typecheck**

Run: `npm --workspace packages/shared run test`

Expected: PASS.

Run: `npm --workspace packages/shared run typecheck`

Expected: PASS.

Run: `npm --workspace packages/shared run build`

Expected: PASS and `packages/shared/dist/index.js` exists for API runtime imports.

- [ ] **Step 7: Commit shared contracts**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore docker-compose.yml packages/shared
git commit -m "chore: scaffold shared app contracts"
```

---

### Task 2: API Scaffold, Database Schema, And Built-In Methods

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/.env.example`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/src/env.ts`
- Create: `apps/api/src/db.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/modules/methods/methods.routes.ts`
- Create: `apps/api/src/test/app.test.ts`

**Interfaces:**
- Consumes:
  - `BREATHING_METHODS_SEED` from `@easy-meditation/shared`.
  - `breathingMethodSchema` from `@easy-meditation/shared`.
- Produces:
  - `buildApp(): Promise<FastifyInstance>`.
  - `GET /health`.
  - `GET /breathing-methods`.

- [ ] **Step 1: Add API package metadata**

Create `apps/api/package.json`:

```json
{
  "name": "@easy-meditation/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "test": "vitest run",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@easy-meditation/shared": "file:../../packages/shared",
    "@fastify/cors": "^10.0.1",
    "@prisma/client": "^6.11.1",
    "dotenv": "^16.4.7",
    "fastify": "^5.4.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "prisma": "^6.11.1",
    "tsx": "^4.20.3",
    "vitest": "^3.2.4"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

Create `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"],
    "module": "NodeNext"
  },
  "include": ["src", "prisma"]
}
```

Create `apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000
  }
});
```

Create `apps/api/.env.example`:

```dotenv
DATABASE_URL="postgresql://easy_meditation:easy_meditation@127.0.0.1:5432/easy_meditation?schema=public"
JWT_SECRET="dev-secret-change-before-production"
ACCESS_TOKEN_TTL_SECONDS="900"
REFRESH_TOKEN_TTL_DAYS="30"
PORT="4000"
```

- [ ] **Step 2: Add Prisma schema**

Create `apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String            @id @default(uuid()) @db.Uuid
  email        String            @unique
  passwordHash String            @map("password_hash")
  nickname     String?
  createdAt    DateTime          @default(now()) @map("created_at")
  updatedAt    DateTime          @updatedAt @map("updated_at")

  refreshTokens   RefreshToken[]
  customRhythms   CustomRhythm[]
  practiceSessions PracticeSession[]
  settings        UserSettings?

  @@map("users")
}

model RefreshToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  tokenHash String    @map("token_hash")
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_tokens")
}

model BreathingMethod {
  id                     String   @id
  slug                   String   @unique
  title                  String
  subtitle               String
  category               String
  defaultDurationSeconds Int      @map("default_duration_seconds")
  phases                 Json
  sortOrder              Int      @map("sort_order")
  isActive               Boolean  @default(true) @map("is_active")
  createdAt              DateTime @default(now()) @map("created_at")
  updatedAt              DateTime @updatedAt @map("updated_at")

  practiceSessions PracticeSession[]

  @@map("breathing_methods")
}

model CustomRhythm {
  id                     String    @id @default(uuid()) @db.Uuid
  userId                 String    @map("user_id") @db.Uuid
  name                   String
  inhaleSeconds          Int       @map("inhale_seconds")
  holdSeconds            Int       @map("hold_seconds")
  exhaleSeconds          Int       @map("exhale_seconds")
  defaultDurationSeconds Int       @map("default_duration_seconds")
  createdAt              DateTime  @default(now()) @map("created_at")
  updatedAt              DateTime  @updatedAt @map("updated_at")
  deletedAt              DateTime? @map("deleted_at")

  user             User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  practiceSessions PracticeSession[]

  @@index([userId])
  @@map("custom_rhythms")
}

model PracticeSession {
  id                     String   @id @default(uuid()) @db.Uuid
  clientSessionId        String   @unique @map("client_session_id") @db.Uuid
  userId                 String   @map("user_id") @db.Uuid
  methodType             String   @map("method_type")
  methodId               String?  @map("method_id")
  customRhythmId         String?  @map("custom_rhythm_id") @db.Uuid
  methodTitleSnapshot    String   @map("method_title_snapshot")
  rhythmSnapshot         Json     @map("rhythm_snapshot")
  plannedDurationSeconds Int      @map("planned_duration_seconds")
  actualDurationSeconds  Int      @map("actual_duration_seconds")
  completed              Boolean
  startedAt              DateTime @map("started_at")
  endedAt                DateTime @map("ended_at")
  createdAt              DateTime @default(now()) @map("created_at")

  user          User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  method        BreathingMethod? @relation(fields: [methodId], references: [id])
  customRhythm  CustomRhythm?    @relation(fields: [customRhythmId], references: [id])

  @@index([userId, endedAt])
  @@map("practice_sessions")
}

model UserSettings {
  userId                String   @id @map("user_id") @db.Uuid
  defaultMethodType     String   @default("built_in") @map("default_method_type")
  defaultMethodId       String?  @default("box") @map("default_method_id")
  defaultCustomRhythmId String?  @map("default_custom_rhythm_id") @db.Uuid
  defaultDurationSeconds Int     @default(180) @map("default_duration_seconds")
  soundEnabled          Boolean  @default(true) @map("sound_enabled")
  hapticsEnabled        Boolean  @default(true) @map("haptics_enabled")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_settings")
}
```

- [ ] **Step 3: Add seed script**

Create `apps/api/prisma/seed.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { BREATHING_METHODS_SEED } from '@easy-meditation/shared';

const prisma = new PrismaClient();

async function main() {
  for (const method of BREATHING_METHODS_SEED) {
    await prisma.breathingMethod.upsert({
      where: { id: method.id },
      update: {
        slug: method.slug,
        title: method.title,
        subtitle: method.subtitle,
        category: method.category,
        defaultDurationSeconds: method.defaultDurationSeconds,
        phases: method.phases,
        sortOrder: method.sortOrder,
        isActive: method.isActive
      },
      create: {
        id: method.id,
        slug: method.slug,
        title: method.title,
        subtitle: method.subtitle,
        category: method.category,
        defaultDurationSeconds: method.defaultDurationSeconds,
        phases: method.phases,
        sortOrder: method.sortOrder,
        isActive: method.isActive
      }
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 4: Write failing API smoke tests**

Create `apps/api/src/test/app.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';

describe('api app', () => {
  test('returns health status', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { ok: true }, error: null });
  });

  test('returns seeded breathing methods', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/breathing-methods' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((method: { id: string }) => method.id)).toEqual([
      'box',
      'four-seven-eight',
      'coherent'
    ]);
  });
});
```

- [ ] **Step 5: Run tests to verify RED**

Run: `npm install`

Expected: install adds API dependencies.

Run: `npm --workspace apps/api run test`

Expected: FAIL because `apps/api/src/app.ts` does not exist.

- [ ] **Step 6: Implement API app and method route**

Create `apps/api/src/env.ts`:

```ts
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PORT: z.coerce.number().int().positive().default(4000)
});

export type ApiEnv = z.infer<typeof envSchema>;

export function loadEnv(input = process.env): ApiEnv {
  return envSchema.parse(input);
}
```

Create `apps/api/src/db.ts`:

```ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

Create `apps/api/src/modules/methods/methods.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { breathingMethodSchema, dataEnvelope } from '@easy-meditation/shared';
import { prisma } from '../../db.js';

export async function registerMethodsRoutes(app: FastifyInstance) {
  app.get('/breathing-methods', async () => {
    const methods = await prisma.breathingMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    const data = methods.map((method) =>
      breathingMethodSchema.parse({
        id: method.id,
        slug: method.slug,
        title: method.title,
        subtitle: method.subtitle,
        category: method.category,
        defaultDurationSeconds: method.defaultDurationSeconds,
        phases: method.phases,
        sortOrder: method.sortOrder,
        isActive: method.isActive
      })
    );

    return dataEnvelope(breathingMethodSchema.array()).parse({ data, error: null });
  });
}
```

Create `apps/api/src/app.ts`:

```ts
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { registerMethodsRoutes } from './modules/methods/methods.routes.js';

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  app.get('/health', async () => ({
    data: { ok: true },
    error: null
  }));

  await registerMethodsRoutes(app);

  return app;
}
```

Create `apps/api/src/server.ts`:

```ts
import { buildApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const app = await buildApp();

await app.listen({ host: '0.0.0.0', port: env.PORT });
```

- [ ] **Step 7: Run migration, seed, and tests**

Run: `Copy-Item apps/api/.env.example apps/api/.env`

Expected: creates local API env file.

Run: `npm run db:up`

Expected: Docker starts PostgreSQL on `127.0.0.1:5432`.

Run: `npm --workspace apps/api run prisma:migrate -- --name init`

Expected: Prisma creates the initial migration and generates the client.

Run: `npm --workspace apps/api run prisma:seed`

Expected: seed completes without errors.

Run: `npm --workspace apps/api run test`

Expected: PASS.

- [ ] **Step 8: Commit API scaffold**

```bash
git add apps/api package.json package-lock.json
git commit -m "feat: scaffold api and breathing methods"
```

---

### Task 3: Email Password Auth And Current User API

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/plugins/auth.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.routes.ts`
- Create: `apps/api/src/modules/me/me.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/test/app.test.ts`

**Interfaces:**
- Consumes:
  - `authRegisterSchema`, `authLoginSchema`, `tokenPairSchema`, `meSchema` from `@easy-meditation/shared`.
  - Prisma models `User`, `RefreshToken`, `UserSettings`.
- Produces:
  - `POST /auth/register`.
  - `POST /auth/login`.
  - `POST /auth/refresh`.
  - `POST /auth/logout`.
  - `GET /me`.
  - `app.authenticate(request)` Fastify decorator.

- [ ] **Step 1: Add auth dependencies**

Modify `apps/api/package.json` dependencies to include:

```json
{
  "dependencies": {
    "@fastify/jwt": "^9.1.0",
    "argon2": "^0.41.1",
    "fastify": "^5.4.0"
  }
}
```

Keep the existing dependencies from Task 2.

Run: `npm install`

Expected: installs auth dependencies.

- [ ] **Step 2: Extend API tests for auth**

Append these tests to `apps/api/src/test/app.test.ts`:

```ts
describe('auth flow', () => {
  test('registers, reads current user, refreshes, and logs out', async () => {
    const app = await buildApp();

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `test-${Date.now()}@example.com`,
        password: 'quiet-breathing-123',
        nickname: 'Tester'
      }
    });
    expect(register.statusCode).toBe(201);

    const tokens = register.json().data.tokens;
    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.email).toContain('@example.com');

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken }
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json().data.accessToken).toEqual(expect.any(String));

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: tokens.refreshToken }
    });
    expect(logout.statusCode).toBe(200);

    await app.close();
  });

  test('rejects invalid login with a generic error', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'missing@example.com', password: 'bad-password' }
    });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
  });
});
```

- [ ] **Step 3: Run tests to verify RED**

Run: `npm --workspace apps/api run test`

Expected: FAIL because auth routes are not registered.

- [ ] **Step 4: Implement auth plugin**

Create `apps/api/src/plugins/auth.ts`:

```ts
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { loadEnv } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    user: {
      sub: string;
      email: string;
    };
  }
}

export const authPlugin = fp(async (app) => {
  const env = loadEnv();
  await app.register(jwt, { secret: env.JWT_SECRET });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Please log in again.' }
      });
    }
  });
});
```

- [ ] **Step 5: Implement auth service**

Create `apps/api/src/modules/auth/auth.service.ts`:

```ts
import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import { loadEnv } from '../../env.js';

export type AuthUser = {
  id: string;
  email: string;
  nickname: string | null;
  createdAt: Date;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export async function issueTokenPair(app: FastifyInstance, user: AuthUser) {
  const env = loadEnv();
  const accessToken = app.jwt.sign(
    { email: user.email },
    { subject: user.id, expiresIn: `${env.ACCESS_TOKEN_TTL_SECONDS}s` }
  );
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt
    }
  });

  return { accessToken, refreshToken };
}
```

- [ ] **Step 6: Implement auth routes**

Create `apps/api/src/modules/auth/auth.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { authLoginSchema, authRegisterSchema, tokenPairSchema } from '@easy-meditation/shared';
import { prisma } from '../../db.js';
import {
  hashPassword,
  hashRefreshToken,
  issueTokenPair,
  normalizeEmail,
  verifyPassword
} from './auth.service.js';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const input = authRegisterSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return reply.code(409).send({
        data: null,
        error: {
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'This email is already registered.',
          fields: { email: 'This email is already registered.' }
        }
      });
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        nickname: input.nickname ?? null,
        settings: { create: {} }
      }
    });
    const tokens = await issueTokenPair(app, user);

    return reply.code(201).send({
      data: {
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          createdAt: user.createdAt.toISOString()
        },
        tokens: tokenPairSchema.parse(tokens)
      },
      error: null
    });
  });

  app.post('/auth/login', async (request, reply) => {
    const input = authLoginSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      return reply.code(401).send({
        data: null,
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' }
      });
    }

    const tokens = await issueTokenPair(app, user);
    return { data: tokenPairSchema.parse(tokens), error: null };
  });

  app.post('/auth/refresh', async (request, reply) => {
    const body = request.body as { refreshToken?: string };
    if (!body.refreshToken) {
      return reply.code(400).send({
        data: null,
        error: { code: 'REFRESH_TOKEN_REQUIRED', message: 'Refresh token is required.' }
      });
    }

    const tokenHash = hashRefreshToken(body.refreshToken);
    const stored = await prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: { user: true }
    });

    if (!stored) {
      return reply.code(401).send({
        data: null,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Please log in again.' }
      });
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() }
    });

    const tokens = await issueTokenPair(app, stored.user);
    return { data: tokenPairSchema.parse(tokens), error: null };
  });

  app.post('/auth/logout', async (request) => {
    const body = request.body as { refreshToken?: string };
    if (body.refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(body.refreshToken), revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    return { data: { ok: true }, error: null };
  });
}
```

- [ ] **Step 7: Implement current user route and register routes**

Create `apps/api/src/modules/me/me.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { meSchema } from '@easy-meditation/shared';
import { prisma } from '../../db.js';

export async function registerMeRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) {
      return reply.code(404).send({
        data: null,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' }
      });
    }

    return {
      data: meSchema.parse({
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        createdAt: user.createdAt.toISOString()
      }),
      error: null
    };
  });
}
```

Modify `apps/api/src/app.ts`:

```ts
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { authPlugin } from './plugins/auth.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerMeRoutes } from './modules/me/me.routes.js';
import { registerMethodsRoutes } from './modules/methods/methods.routes.js';

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await app.register(authPlugin);

  app.get('/health', async () => ({
    data: { ok: true },
    error: null
  }));

  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerMethodsRoutes(app);

  return app;
}
```

- [ ] **Step 8: Run auth tests**

Run: `npm --workspace apps/api run test`

Expected: PASS.

Run: `npm --workspace apps/api run typecheck`

Expected: PASS.

- [ ] **Step 9: Commit auth API**

```bash
git add apps/api package.json package-lock.json
git commit -m "feat: add email password auth api"
```

---

### Task 4: Practice Session Persistence And Stats API

**Files:**
- Create: `apps/api/src/modules/sessions/sessions.routes.ts`
- Create: `apps/api/src/modules/stats/stats.service.ts`
- Create: `apps/api/src/modules/stats/stats.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/test/app.test.ts`

**Interfaces:**
- Consumes:
  - Auth plugin from Task 3.
  - `practiceSessionCreateSchema`, `practiceSessionSchema`, `statsSummarySchema`.
- Produces:
  - `POST /practice-sessions`.
  - `GET /practice-sessions`.
  - `GET /stats/summary`.
  - Idempotent session creation through `clientSessionId`.

- [ ] **Step 1: Add failing API tests for sessions and stats**

Append this helper and test to `apps/api/src/test/app.test.ts`:

```ts
async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `session-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
      password: 'quiet-breathing-123'
    }
  });

  return response.json().data.tokens.accessToken as string;
}

describe('practice sessions and stats', () => {
  test('creates one practice session idempotently and updates stats', async () => {
    const app = await buildApp();
    const accessToken = await registerTestUser(app);
    const clientSessionId = crypto.randomUUID();
    const payload = {
      clientSessionId,
      methodType: 'built_in',
      methodId: 'box',
      customRhythmId: null,
      methodTitleSnapshot: '盒式呼吸',
      rhythmSnapshot: [
        { kind: 'inhale', label: '吸气', durationSeconds: 4 },
        { kind: 'hold', label: '屏息', durationSeconds: 4 },
        { kind: 'exhale', label: '呼气', durationSeconds: 4 },
        { kind: 'hold', label: '屏息', durationSeconds: 4 }
      ],
      plannedDurationSeconds: 180,
      actualDurationSeconds: 120,
      completed: false,
      startedAt: new Date('2026-07-07T08:00:00.000Z').toISOString(),
      endedAt: new Date('2026-07-07T08:02:00.000Z').toISOString()
    };

    const created = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.actualDurationSeconds).toBe(120);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().data.id).toBe(created.json().data.id);

    const stats = await app.inject({
      method: 'GET',
      url: '/stats/summary',
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().data.totalSessions).toBe(1);
    expect(stats.json().data.totalPracticeSeconds).toBe(120);

    await app.close();
  });
});
```

Also add `import crypto from 'node:crypto';` at the top of `apps/api/src/test/app.test.ts`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm --workspace apps/api run test`

Expected: FAIL because `/practice-sessions` and `/stats/summary` are not registered.

- [ ] **Step 3: Implement practice session routes**

Create `apps/api/src/modules/sessions/sessions.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import {
  practiceSessionCreateSchema,
  practiceSessionSchema
} from '@easy-meditation/shared';
import { prisma } from '../../db.js';

function mapSession(session: {
  id: string;
  clientSessionId: string;
  methodType: string;
  methodId: string | null;
  customRhythmId: string | null;
  methodTitleSnapshot: string;
  rhythmSnapshot: unknown;
  plannedDurationSeconds: number;
  actualDurationSeconds: number;
  completed: boolean;
  startedAt: Date;
  endedAt: Date;
  createdAt: Date;
}) {
  return practiceSessionSchema.parse({
    id: session.id,
    clientSessionId: session.clientSessionId,
    methodType: session.methodType,
    methodId: session.methodId,
    customRhythmId: session.customRhythmId,
    methodTitleSnapshot: session.methodTitleSnapshot,
    rhythmSnapshot: session.rhythmSnapshot,
    plannedDurationSeconds: session.plannedDurationSeconds,
    actualDurationSeconds: session.actualDurationSeconds,
    completed: session.completed,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    createdAt: session.createdAt.toISOString()
  });
}

export async function registerSessionRoutes(app: FastifyInstance) {
  app.get('/practice-sessions', { preHandler: [app.authenticate] }, async (request) => {
    const sessions = await prisma.practiceSession.findMany({
      where: { userId: request.user.sub },
      orderBy: { endedAt: 'desc' },
      take: 50
    });

    return { data: sessions.map(mapSession), error: null };
  });

  app.post('/practice-sessions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = practiceSessionCreateSchema.parse(request.body);
    const existing = await prisma.practiceSession.findUnique({
      where: { clientSessionId: input.clientSessionId }
    });

    if (existing) {
      return { data: mapSession(existing), error: null };
    }

    const session = await prisma.practiceSession.create({
      data: {
        clientSessionId: input.clientSessionId,
        userId: request.user.sub,
        methodType: input.methodType,
        methodId: input.methodId,
        customRhythmId: input.customRhythmId,
        methodTitleSnapshot: input.methodTitleSnapshot,
        rhythmSnapshot: input.rhythmSnapshot,
        plannedDurationSeconds: input.plannedDurationSeconds,
        actualDurationSeconds: input.actualDurationSeconds,
        completed: input.completed,
        startedAt: new Date(input.startedAt),
        endedAt: new Date(input.endedAt)
      }
    });

    return reply.code(201).send({ data: mapSession(session), error: null });
  });
}
```

- [ ] **Step 4: Implement stats service and route**

Create `apps/api/src/modules/stats/stats.service.ts`:

```ts
import type { PracticeSession } from '@prisma/client';

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcDateKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

export function deriveCurrentStreak(sessions: Pick<PracticeSession, 'endedAt'>[], now = new Date()): number {
  const practicedDays = new Set(sessions.map((session) => utcDateKey(session.endedAt)));
  let cursor = startOfUtcDay(now);
  let streak = 0;

  while (practicedDays.has(utcDateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  return streak;
}

export function deriveWeeklyPracticeSeconds(
  sessions: Pick<PracticeSession, 'endedAt' | 'actualDurationSeconds'>[],
  now = new Date()
): number {
  const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  return sessions
    .filter((session) => session.endedAt >= weekStart)
    .reduce((sum, session) => sum + session.actualDurationSeconds, 0);
}
```

Create `apps/api/src/modules/stats/stats.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { statsSummarySchema } from '@easy-meditation/shared';
import { prisma } from '../../db.js';
import { deriveCurrentStreak, deriveWeeklyPracticeSeconds } from './stats.service.js';
import { practiceSessionSchema } from '@easy-meditation/shared';

export async function registerStatsRoutes(app: FastifyInstance) {
  app.get('/stats/summary', { preHandler: [app.authenticate] }, async (request) => {
    const sessions = await prisma.practiceSession.findMany({
      where: { userId: request.user.sub },
      orderBy: { endedAt: 'desc' },
      take: 200
    });

    const recentSessions = sessions.slice(0, 10).map((session) =>
      practiceSessionSchema.parse({
        id: session.id,
        clientSessionId: session.clientSessionId,
        methodType: session.methodType,
        methodId: session.methodId,
        customRhythmId: session.customRhythmId,
        methodTitleSnapshot: session.methodTitleSnapshot,
        rhythmSnapshot: session.rhythmSnapshot,
        plannedDurationSeconds: session.plannedDurationSeconds,
        actualDurationSeconds: session.actualDurationSeconds,
        completed: session.completed,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt.toISOString(),
        createdAt: session.createdAt.toISOString()
      })
    );

    return {
      data: statsSummarySchema.parse({
        totalSessions: sessions.length,
        totalPracticeSeconds: sessions.reduce((sum, session) => sum + session.actualDurationSeconds, 0),
        weeklyPracticeSeconds: deriveWeeklyPracticeSeconds(sessions),
        currentStreak: deriveCurrentStreak(sessions),
        recentSessions
      }),
      error: null
    };
  });
}
```

- [ ] **Step 5: Register new routes**

Modify `apps/api/src/app.ts`:

```ts
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { authPlugin } from './plugins/auth.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerMeRoutes } from './modules/me/me.routes.js';
import { registerMethodsRoutes } from './modules/methods/methods.routes.js';
import { registerSessionRoutes } from './modules/sessions/sessions.routes.js';
import { registerStatsRoutes } from './modules/stats/stats.routes.js';

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await app.register(authPlugin);

  app.get('/health', async () => ({
    data: { ok: true },
    error: null
  }));

  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerMethodsRoutes(app);
  await registerSessionRoutes(app);
  await registerStatsRoutes(app);

  return app;
}
```

- [ ] **Step 6: Run session tests**

Run: `npm --workspace apps/api run test`

Expected: PASS.

Run: `npm --workspace apps/api run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit session API**

```bash
git add apps/api
git commit -m "feat: persist practice sessions and stats"
```

---

### Task 5: Expo Mobile Scaffold, Auth Store, And API Client

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/babel.config.js`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/(auth)/login.tsx`
- Create: `apps/mobile/app/(auth)/register.tsx`
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/practice.tsx`
- Create: `apps/mobile/src/api/client.ts`
- Create: `apps/mobile/src/api/auth.ts`
- Create: `apps/mobile/src/store/authStore.ts`
- Create: `apps/mobile/src/components/Screen.tsx`
- Create: `apps/mobile/src/theme/tokens.ts`

**Interfaces:**
- Consumes:
  - Auth API from Task 3.
  - `AuthLoginInput`, `AuthRegisterInput`, `TokenPair`.
- Produces:
  - Expo app that can log in and register.
  - `apiRequest<T>(path, options): Promise<T>`.
  - `useAuthStore` with `accessToken`, `refreshToken`, `login`, `register`, `logout`, `restore`.

- [ ] **Step 1: Create mobile package metadata**

Create `apps/mobile/package.json`:

```json
{
  "name": "@easy-meditation/mobile",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@easy-meditation/shared": "file:../../packages/shared",
    "@tanstack/react-query": "^5.81.5",
    "expo": "^53.0.0",
    "expo-constants": "^17.1.7",
    "expo-crypto": "^14.1.5",
    "expo-linking": "^7.1.7",
    "expo-router": "^5.1.0",
    "expo-secure-store": "^14.2.3",
    "expo-status-bar": "^2.2.3",
    "react": "^19.0.0",
    "react-native": "^0.79.0",
    "react-native-gesture-handler": "^2.26.0",
    "react-native-reanimated": "^3.17.5",
    "react-native-safe-area-context": "^5.4.0",
    "react-native-screens": "^4.11.1",
    "zod": "^3.25.76",
    "zustand": "^5.0.6"
  },
  "devDependencies": {
    "@types/react": "^19.0.14",
    "babel-preset-expo": "^13.2.3",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

Create `apps/mobile/app.json`:

```json
{
  "expo": {
    "name": "Easy Meditation",
    "slug": "easy-meditation",
    "scheme": "easy-meditation",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "newArchEnabled": true,
    "plugins": ["expo-router", "expo-secure-store"]
  }
}
```

Create `apps/mobile/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin']
  };
};
```

Create `apps/mobile/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "paths": {
      "@easy-meditation/shared": ["../../packages/shared/src/index.ts"]
    },
    "types": ["react", "react-native"]
  },
  "include": ["app", "src", "expo-env.d.ts"]
}
```

- [ ] **Step 2: Add mobile theme and layout components**

Create `apps/mobile/src/theme/tokens.ts`:

```ts
export const colors = {
  backgroundTop: '#f0f2ff',
  backgroundMid: '#e8fbfa',
  backgroundBottom: '#f7f8fa',
  surface: 'rgba(255, 255, 255, 0.82)',
  ink: '#111622',
  muted: '#69717f',
  accent: '#49736f',
  accentStrong: '#245e59',
  lilac: '#dfe0f8',
  mint: '#dff2ea',
  blue: '#d7eef7'
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32
};
```

Create `apps/mobile/src/components/Screen.tsx`:

```tsx
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/tokens';

export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundMid
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.backgroundMid
  }
});
```

- [ ] **Step 3: Add API client and auth store**

Create `apps/mobile/src/api/client.ts`:

```ts
import { useAuthStore } from '../store/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';

export type ApiRequestOptions = RequestInit & {
  skipAuth?: boolean;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');

  const token = useAuthStore.getState().accessToken;
  if (token && !options.skipAuth) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });
  const body = await response.json();

  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? 'Request failed');
  }

  return body.data as T;
}
```

Create `apps/mobile/src/api/auth.ts`:

```ts
import type { AuthLoginInput, AuthRegisterInput, Me, TokenPair } from '@easy-meditation/shared';
import { apiRequest } from './client';

export async function login(input: AuthLoginInput): Promise<TokenPair> {
  return apiRequest<TokenPair>('/auth/login', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(input)
  });
}

export async function register(input: AuthRegisterInput): Promise<{ user: Me; tokens: TokenPair }> {
  return apiRequest<{ user: Me; tokens: TokenPair }>('/auth/register', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(input)
  });
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  return apiRequest<TokenPair>('/auth/refresh', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ refreshToken })
  });
}

export async function getMe(): Promise<Me> {
  return apiRequest<Me>('/me');
}
```

Create `apps/mobile/src/store/authStore.ts`:

```ts
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { AuthLoginInput, AuthRegisterInput } from '@easy-meditation/shared';
import * as authApi from '../api/auth';

const REFRESH_TOKEN_KEY = 'easyMeditation.refreshToken';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  isRestoring: boolean;
  login(input: AuthLoginInput): Promise<void>;
  register(input: AuthRegisterInput): Promise<void>;
  restore(): Promise<void>;
  logout(): Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  isRestoring: true,
  async login(input) {
    const tokens = await authApi.login(input);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
    set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  },
  async register(input) {
    const result = await authApi.register(input);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.tokens.refreshToken);
    set({ accessToken: result.tokens.accessToken, refreshToken: result.tokens.refreshToken });
  },
  async restore() {
    const saved = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!saved) {
      set({ isRestoring: false });
      return;
    }

    try {
      const tokens = await authApi.refresh(saved);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
      set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, isRestoring: false });
    } catch {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      set({ accessToken: null, refreshToken: null, isRestoring: false });
    }
  },
  async logout() {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    set({ accessToken: null, refreshToken: null });
  }
}));
```

- [ ] **Step 4: Add navigation shell and auth screens**

Create `apps/mobile/app/_layout.tsx`:

```tsx
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/store/authStore';
import { colors } from '../src/theme/tokens';

const queryClient = new QueryClient();

function RootNavigator() {
  const { accessToken, isRestoring, restore } = useAuthStore();

  useEffect(() => {
    void restore();
  }, [restore]);

  if (isRestoring) {
    return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.backgroundMid }} />;
  }

  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="session/[methodId]" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <RootNavigator />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
```

Create `apps/mobile/app/(auth)/login.tsx`:

```tsx
import { useState } from 'react';
import { Link, router } from 'expo-router';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { useAuthStore } from '../../src/store/authStore';
import { colors, spacing } from '../../src/theme/tokens';

export default function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    try {
      await login({ email, password });
      router.replace('/(tabs)/practice');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请再试一次。');
    }
  }

  return (
    <Screen>
      <View style={styles.form}>
        <Text style={styles.title}>欢迎回来</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="邮箱" />
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="密码" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="登录" onPress={submit} />
        <Link href="/(auth)/register" style={styles.link}>创建新账号</Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1, justifyContent: 'center', gap: spacing.md },
  title: { color: colors.ink, fontSize: 34, fontWeight: '700' },
  input: { minHeight: 52, borderRadius: 18, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  error: { color: '#a64242' },
  link: { color: colors.accentStrong, textAlign: 'center' }
});
```

Create `apps/mobile/app/(auth)/register.tsx`:

```tsx
import { useState } from 'react';
import { router } from 'expo-router';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { useAuthStore } from '../../src/store/authStore';
import { colors, spacing } from '../../src/theme/tokens';

export default function RegisterScreen() {
  const register = useAuthStore((state) => state.register);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    try {
      await register({ email, nickname: nickname || undefined, password });
      router.replace('/(tabs)/practice');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请再试一次。');
    }
  }

  return (
    <Screen>
      <View style={styles.form}>
        <Text style={styles.title}>创建账号</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="邮箱" />
        <TextInput style={styles.input} value={nickname} onChangeText={setNickname} placeholder="昵称，可不填" />
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="密码，至少 8 位" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="注册并开始" onPress={submit} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1, justifyContent: 'center', gap: spacing.md },
  title: { color: colors.ink, fontSize: 34, fontWeight: '700' },
  input: { minHeight: 52, borderRadius: 18, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  error: { color: '#a64242' }
});
```

Create `apps/mobile/app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';
import { colors } from '../../src/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accentStrong }}>
      <Tabs.Screen name="practice" options={{ title: '冥想' }} />
      <Tabs.Screen name="records" options={{ title: '记录' }} />
    </Tabs>
  );
}
```

Create a temporary `apps/mobile/app/(tabs)/practice.tsx`:

```tsx
import { Text } from 'react-native';
import { Screen } from '../../src/components/Screen';

export default function PracticeScreen() {
  return (
    <Screen>
      <Text>呼吸训练</Text>
    </Screen>
  );
}
```

- [ ] **Step 5: Run mobile typecheck**

Run: `npm install`

Expected: installs mobile dependencies.

Run: `npm --workspace apps/mobile run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit mobile auth scaffold**

```bash
git add apps/mobile package.json package-lock.json
git commit -m "feat: scaffold expo auth flow"
```

---

### Task 6: Mobile Practice Home And Local Session Clock

**Files:**
- Create: `apps/mobile/src/api/methods.ts`
- Create: `apps/mobile/src/domain/sessionClock.ts`
- Create: `apps/mobile/src/domain/sessionClock.test.ts`
- Modify: `apps/mobile/app/(tabs)/practice.tsx`
- Create: `apps/mobile/app/session/[methodId].tsx`

**Interfaces:**
- Consumes:
  - `GET /breathing-methods`.
  - `BreathingMethod`, `getSessionSnapshot`, `secondsToTimerLabel`.
- Produces:
  - `fetchBreathingMethods(): Promise<BreathingMethod[]>`.
  - `createSessionClock(method, durationSeconds, now): SessionClock`.
  - Practice home with backend-loaded method cards.
  - Focus session screen with local timer.

- [ ] **Step 1: Add failing session clock tests**

Create `apps/mobile/src/domain/sessionClock.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { BREATHING_METHODS_SEED } from '@easy-meditation/shared';
import { createSessionClock } from './sessionClock';

describe('mobile session clock', () => {
  test('starts, pauses, resumes, and completes from wall clock time', () => {
    let time = 0;
    const clock = createSessionClock(BREATHING_METHODS_SEED[0], 120, () => time);

    expect(clock.snapshot().status).toBe('idle');
    clock.start();
    time += 4000;
    expect(clock.snapshot().phase.label).toBe('屏息');

    clock.pause();
    time += 10000;
    expect(clock.snapshot().phase.label).toBe('屏息');

    clock.resume();
    time += 116000;
    expect(clock.snapshot().status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run mobile tests to verify RED**

Run: `npm --workspace apps/mobile run test`

Expected: FAIL because `sessionClock.ts` does not exist.

- [ ] **Step 3: Implement session clock helper**

Create `apps/mobile/src/domain/sessionClock.ts`:

```ts
import type { BreathingMethod, SessionSnapshot } from '@easy-meditation/shared';
import { getSessionSnapshot } from '@easy-meditation/shared';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'completed';

export type SessionClockSnapshot = {
  status: SessionStatus;
  elapsedSeconds: number;
  remainingSeconds: number;
  phase: SessionSnapshot;
};

export function createSessionClock(
  method: BreathingMethod,
  durationSeconds: number,
  now: () => number = () => Date.now()
) {
  let status: SessionStatus = 'idle';
  let elapsedBeforeRun = 0;
  let startedAt = 0;

  function elapsedSeconds() {
    if (status !== 'running') return elapsedBeforeRun;
    return elapsedBeforeRun + Math.floor((now() - startedAt) / 1000);
  }

  function snapshot(): SessionClockSnapshot {
    const elapsed = Math.min(durationSeconds, elapsedSeconds());
    const phase = getSessionSnapshot(method, elapsed, durationSeconds);
    if (phase.isComplete && status === 'running') {
      status = 'completed';
      elapsedBeforeRun = durationSeconds;
    }

    return {
      status,
      elapsedSeconds: elapsed,
      remainingSeconds: phase.remainingInSession,
      phase
    };
  }

  return {
    start() {
      if (status !== 'idle') return;
      status = 'running';
      startedAt = now();
    },
    pause() {
      if (status !== 'running') return;
      elapsedBeforeRun = elapsedSeconds();
      status = 'paused';
    },
    resume() {
      if (status !== 'paused') return;
      status = 'running';
      startedAt = now();
    },
    snapshot
  };
}
```

- [ ] **Step 4: Add method API function**

Create `apps/mobile/src/api/methods.ts`:

```ts
import type { BreathingMethod } from '@easy-meditation/shared';
import { apiRequest } from './client';

export async function fetchBreathingMethods(): Promise<BreathingMethod[]> {
  return apiRequest<BreathingMethod[]>('/breathing-methods');
}
```

- [ ] **Step 5: Replace practice screen with method cards**

Modify `apps/mobile/app/(tabs)/practice.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchBreathingMethods } from '../../src/api/methods';
import { Screen } from '../../src/components/Screen';
import { colors, spacing } from '../../src/theme/tokens';

export default function PracticeScreen() {
  const methodsQuery = useQuery({ queryKey: ['breathing-methods'], queryFn: fetchBreathingMethods });

  if (methodsQuery.isLoading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>选择要进行的呼吸训练。</Text>
      <View style={styles.grid}>
        {methodsQuery.data?.map((method) => (
          <Pressable
            key={method.id}
            style={styles.card}
            onPress={() => router.push(`/session/${method.id}`)}
          >
            <Text style={styles.cardTitle}>{method.title}</Text>
            <Text style={styles.cardSubtitle}>{method.subtitle}</Text>
            <Text style={styles.duration}>{Math.round(method.defaultDurationSeconds / 60)} 分钟</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 28, fontWeight: '800', marginBottom: spacing.xl },
  grid: { gap: spacing.md },
  card: { minHeight: 132, justifyContent: 'space-between', borderRadius: 30, padding: spacing.lg, backgroundColor: colors.surface },
  cardTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  cardSubtitle: { color: colors.muted, fontSize: 15 },
  duration: { color: colors.accentStrong, fontSize: 15, fontWeight: '700' }
});
```

- [ ] **Step 6: Add focus session screen**

Create `apps/mobile/app/session/[methodId].tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, StyleSheet, Text, View } from 'react-native';
import { secondsToTimerLabel } from '@easy-meditation/shared';
import { fetchBreathingMethods } from '../../src/api/methods';
import { Screen } from '../../src/components/Screen';
import { createSessionClock } from '../../src/domain/sessionClock';
import { colors, spacing } from '../../src/theme/tokens';

export default function SessionScreen() {
  const { methodId } = useLocalSearchParams<{ methodId: string }>();
  const methodsQuery = useQuery({ queryKey: ['breathing-methods'], queryFn: fetchBreathingMethods });
  const method = methodsQuery.data?.find((item) => item.id === methodId);
  const clock = useMemo(
    () => (method ? createSessionClock(method, method.defaultDurationSeconds) : null),
    [method]
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 250);
    return () => clearInterval(timer);
  }, []);

  if (!method || !clock) {
    return (
      <Screen>
        <Text>正在准备训练...</Text>
      </Screen>
    );
  }

  const snapshot = clock.snapshot();

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.phase}>{snapshot.phase.label}</Text>
        <Text style={styles.count}>{snapshot.phase.remainingInPhase}</Text>
        <View style={styles.orb} />
        <Text style={styles.timer}>{secondsToTimerLabel(snapshot.remainingSeconds)}</Text>
        {snapshot.status === 'idle' ? <Button title="开始" onPress={() => { clock.start(); setTick(tick + 1); }} /> : null}
        {snapshot.status === 'running' ? <Button title="暂停" onPress={() => { clock.pause(); setTick(tick + 1); }} /> : null}
        {snapshot.status === 'paused' ? <Button title="继续" onPress={() => { clock.resume(); setTick(tick + 1); }} /> : null}
        <Button title="返回" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  phase: { color: colors.ink, fontSize: 42, fontWeight: '700' },
  count: { color: colors.muted, fontSize: 30 },
  orb: { width: 220, height: 220, borderRadius: 110, backgroundColor: colors.lilac },
  timer: { color: colors.ink, fontSize: 38, fontWeight: '700' }
});
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npm --workspace apps/mobile run test`

Expected: PASS.

Run: `npm --workspace apps/mobile run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit practice session UI**

```bash
git add apps/mobile
git commit -m "feat: add mobile practice session flow"
```

---

### Task 7: Mobile Session Submission And Records Summary

**Files:**
- Create: `apps/mobile/src/api/sessions.ts`
- Create: `apps/mobile/src/api/stats.ts`
- Modify: `apps/mobile/app/session/[methodId].tsx`
- Create: `apps/mobile/app/(tabs)/records.tsx`

**Interfaces:**
- Consumes:
  - `POST /practice-sessions`.
  - `GET /stats/summary`.
  - `PracticeSessionCreateInput`, `StatsSummary`.
- Produces:
  - `createPracticeSession(input): Promise<PracticeSession>`.
  - `fetchStatsSummary(): Promise<StatsSummary>`.
  - Session completion submission.
  - Records tab that displays server-derived stats.

- [ ] **Step 1: Add session and stats API helpers**

Create `apps/mobile/src/api/sessions.ts`:

```ts
import type { PracticeSession, PracticeSessionCreateInput } from '@easy-meditation/shared';
import { apiRequest } from './client';

export async function createPracticeSession(input: PracticeSessionCreateInput): Promise<PracticeSession> {
  return apiRequest<PracticeSession>('/practice-sessions', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}
```

Create `apps/mobile/src/api/stats.ts`:

```ts
import type { StatsSummary } from '@easy-meditation/shared';
import { apiRequest } from './client';

export async function fetchStatsSummary(): Promise<StatsSummary> {
  return apiRequest<StatsSummary>('/stats/summary');
}
```

- [ ] **Step 2: Submit completed sessions from the session screen**

Modify `apps/mobile/app/session/[methodId].tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Button, StyleSheet, Text, View } from 'react-native';
import { secondsToTimerLabel } from '@easy-meditation/shared';
import { fetchBreathingMethods } from '../../src/api/methods';
import { createPracticeSession } from '../../src/api/sessions';
import { Screen } from '../../src/components/Screen';
import { createSessionClock } from '../../src/domain/sessionClock';
import { colors, spacing } from '../../src/theme/tokens';

export default function SessionScreen() {
  const { methodId } = useLocalSearchParams<{ methodId: string }>();
  const queryClient = useQueryClient();
  const methodsQuery = useQuery({ queryKey: ['breathing-methods'], queryFn: fetchBreathingMethods });
  const method = methodsQuery.data?.find((item) => item.id === methodId);
  const startedAtRef = useRef<string | null>(null);
  const submittedRef = useRef(false);
  const clock = useMemo(
    () => (method ? createSessionClock(method, method.defaultDurationSeconds) : null),
    [method]
  );
  const [tick, setTick] = useState(0);
  const mutation = useMutation({
    mutationFn: createPracticeSession,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stats-summary'] });
    }
  });

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 250);
    return () => clearInterval(timer);
  }, []);

  if (!method || !clock) {
    return (
      <Screen>
        <Text>正在准备训练...</Text>
      </Screen>
    );
  }

  const snapshot = clock.snapshot();
  const shouldSubmit = snapshot.status === 'completed' && !submittedRef.current;
  if (shouldSubmit) {
    submittedRef.current = true;
    void mutation.mutateAsync({
      clientSessionId: Crypto.randomUUID(),
      methodType: 'built_in',
      methodId: method.id,
      customRhythmId: null,
      methodTitleSnapshot: method.title,
      rhythmSnapshot: method.phases,
      plannedDurationSeconds: method.defaultDurationSeconds,
      actualDurationSeconds: snapshot.elapsedSeconds,
      completed: true,
      startedAt: startedAtRef.current ?? new Date().toISOString(),
      endedAt: new Date().toISOString()
    });
  }

  function start() {
    startedAtRef.current = new Date().toISOString();
    clock.start();
    setTick((value) => value + 1);
  }

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.phase}>{snapshot.phase.label}</Text>
        <Text style={styles.count}>{snapshot.phase.remainingInPhase}</Text>
        <View style={styles.orb} />
        <Text style={styles.timer}>{secondsToTimerLabel(snapshot.remainingSeconds)}</Text>
        {snapshot.status === 'idle' ? <Button title="开始" onPress={start} /> : null}
        {snapshot.status === 'running' ? <Button title="暂停" onPress={() => { clock.pause(); setTick(tick + 1); }} /> : null}
        {snapshot.status === 'paused' ? <Button title="继续" onPress={() => { clock.resume(); setTick(tick + 1); }} /> : null}
        {snapshot.status === 'completed' ? <Text>{mutation.isSuccess ? '已保存练习记录' : '正在保存练习记录...'}</Text> : null}
        <Button title="返回" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  phase: { color: colors.ink, fontSize: 42, fontWeight: '700' },
  count: { color: colors.muted, fontSize: 30 },
  orb: { width: 220, height: 220, borderRadius: 110, backgroundColor: colors.lilac },
  timer: { color: colors.ink, fontSize: 38, fontWeight: '700' }
});
```

- [ ] **Step 3: Add records tab**

Create `apps/mobile/app/(tabs)/records.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { fetchStatsSummary } from '../../src/api/stats';
import { Screen } from '../../src/components/Screen';
import { colors, spacing } from '../../src/theme/tokens';

function minutes(seconds: number) {
  return Math.round(seconds / 60);
}

export default function RecordsScreen() {
  const statsQuery = useQuery({ queryKey: ['stats-summary'], queryFn: fetchStatsSummary });

  if (statsQuery.isLoading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  const stats = statsQuery.data;

  return (
    <Screen>
      <Text style={styles.title}>练习记录</Text>
      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.value}>{stats?.currentStreak ?? 0}</Text>
          <Text style={styles.label}>连续天数</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.value}>{minutes(stats?.weeklyPracticeSeconds ?? 0)}</Text>
          <Text style={styles.label}>本周分钟</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.value}>{stats?.totalSessions ?? 0}</Text>
          <Text style={styles.label}>完成次数</Text>
        </View>
      </View>
      <View style={styles.list}>
        {stats?.recentSessions.map((session) => (
          <View key={session.id} style={styles.row}>
            <Text style={styles.rowTitle}>{session.methodTitleSnapshot}</Text>
            <Text style={styles.rowMeta}>{minutes(session.actualDurationSeconds)} 分钟</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 30, fontWeight: '800', marginBottom: spacing.lg },
  grid: { flexDirection: 'row', gap: spacing.sm },
  card: { flex: 1, borderRadius: 24, padding: spacing.md, backgroundColor: colors.surface },
  value: { color: colors.accentStrong, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  label: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  list: { marginTop: spacing.lg, gap: spacing.sm },
  row: { borderRadius: 20, padding: spacing.md, backgroundColor: colors.surface },
  rowTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  rowMeta: { color: colors.muted, marginTop: spacing.xs }
});
```

- [ ] **Step 4: Run mobile typecheck**

Run: `npm --workspace apps/mobile run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit records integration**

```bash
git add apps/mobile
git commit -m "feat: submit mobile sessions to api"
```

---

### Task 8: End-To-End Local Verification

**Files:**
- Create: `docs/mobile-backend-local-verification.md`

**Interfaces:**
- Consumes:
  - API server from Tasks 2-4.
  - Expo mobile app from Tasks 5-7.
- Produces:
  - Verified local development loop.
  - Short verification doc with exact commands and observed result.

- [ ] **Step 1: Run all automated checks**

Run: `npm run typecheck`

Expected: PASS for all workspaces.

Run: `npm run test`

Expected: PASS for shared, API, and mobile tests.

Run: `npm run build --workspaces --if-present`

Expected: PASS for shared and API builds. Mobile may typecheck instead of producing a native build in this milestone.

- [ ] **Step 2: Start database and API**

Run: `npm run db:up`

Expected: PostgreSQL is running.

Run: `npm --workspace apps/api run prisma:migrate`

Expected: database is up to date.

Run: `npm --workspace apps/api run prisma:seed`

Expected: built-in breathing methods are present.

Run: `npm run dev:api`

Expected: API listens on `http://127.0.0.1:4000`.

- [ ] **Step 3: Verify API manually with PowerShell**

Run:

```powershell
$register = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/auth/register' -ContentType 'application/json' -Body (@{
  email = "local-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())@example.com"
  password = "quiet-breathing-123"
  nickname = "Local Tester"
} | ConvertTo-Json)
$token = $register.data.tokens.accessToken
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:4000/breathing-methods'
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:4000/me' -Headers @{ Authorization = "Bearer $token" }
```

Expected: registration returns tokens, methods return three built-in methods, `/me` returns the registered user.

- [ ] **Step 4: Start mobile app**

Run: `$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:4000'; npm run dev:mobile`

Expected: Expo starts and displays a QR code/dev menu.

Manual check:

- Register a new account.
- Confirm the practice screen shows API-loaded breathing methods.
- Start a method.
- Let the shortest possible session complete by temporarily setting the seeded method duration to 60 seconds in local database or using a fast test method during manual development.
- Confirm the records screen shows updated total sessions and weekly minutes.

- [ ] **Step 5: Document verification**

Create `docs/mobile-backend-local-verification.md`:

```markdown
# Mobile Backend Local Verification

Date: 2026-07-07

## Commands

- `npm run typecheck`
- `npm run test`
- `npm run build --workspaces --if-present`
- `npm run db:up`
- `npm --workspace apps/api run prisma:migrate`
- `npm --workspace apps/api run prisma:seed`
- `npm run dev:api`
- `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4000 npm run dev:mobile`

## Result

- Shared package checks: passed.
- API checks: passed.
- Mobile typecheck: passed.
- Local API registration: passed.
- Breathing methods from API: passed.
- Mobile auth flow: passed.
- Mobile session submission: passed.
- Records summary refresh: passed.

## Notes

The first vertical slice is verified locally with PostgreSQL, the Fastify API, and the Expo mobile app.
```

- [ ] **Step 6: Commit verification**

```bash
git add docs/mobile-backend-local-verification.md
git commit -m "test: verify mobile backend vertical slice"
```

---

## Self-Review

- Spec coverage: This plan covers the first implementation milestone from the approved spec: monorepo scaffold, API auth/current user/built-in methods, mobile auth flow, mobile method list, local session timer, backend session persistence, and server-derived stats.
- Deferred spec areas: custom rhythm editing, settings editing, full offline retry, email verification, password reset, and native audio/haptics are intentionally excluded from this vertical-slice plan and should receive separate plans.
- Placeholder scan: no placeholder markers, incomplete sections, or implementation-free validation steps remain.
- Type consistency: shared schema names match API and mobile imports: `BreathingMethod`, `PracticeSessionCreateInput`, `PracticeSession`, `StatsSummary`, `AuthLoginInput`, `AuthRegisterInput`, and `TokenPair`.
- Interface consistency: API routes match the approved spec paths: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/me`, `/breathing-methods`, `/practice-sessions`, and `/stats/summary`.
