# Mobile Backend Local Verification

Date: 2026-07-08
Worktree: `D:/dev/projects/easy-meditation/.worktrees/mobile-backend-vertical-slice`
Branch: `codex/mobile-backend-vertical-slice`

## Automated Checks

- `npm test`
  - Passed.
  - API: 19 tests passed.
  - Mobile: 23 tests passed.
  - Shared: 10 tests passed.
- `npm run typecheck --workspaces --if-present`
  - Passed for `apps/api`, `apps/mobile`, and `packages/shared`.
- `npm run build --workspaces --if-present`
  - Passed for `apps/api` and `packages/shared`.
  - `apps/mobile` does not define a build script in this milestone, so mobile verification stayed on test + typecheck + Expo boot.

## Database And API

Recorded verification commands run:

- `npm run db:up`
- `docker compose ps`
- `npm --workspace apps/api run prisma:migrate`
- `npm --workspace apps/api run prisma:seed`
- `npm --workspace apps/api run build`
- `Start-Process -FilePath 'npm.cmd' -ArgumentList '--workspace','apps/api','run','start' -WorkingDirectory (Get-Location) -WindowStyle Hidden -RedirectStandardOutput '.superpowers/sdd/logs/final-api-start.stdout.log' -RedirectStandardError '.superpowers/sdd/logs/final-api-start.stderr.log' -PassThru`

Human-facing equivalent:

- `npm --workspace apps/api run build`
- `npm --workspace apps/api run start`

Observed result:

- PostgreSQL container `mobile-backend-vertical-slice-postgres-1` was already running with Docker publishing `0.0.0.0:5432`; local verification connected through `127.0.0.1:5432`.
- Prisma migrate reported `Already in sync, no schema change or pending migration was found.`
- Prisma seed completed without error.
- API started on `http://127.0.0.1:4000`.

Background process state:

- API process left running intentionally for local follow-up testing from the built output.
- Listener: `0.0.0.0:4000`
- Owning PID: `36844`
- Stdout log: `.superpowers/sdd/logs/final-api-start.stdout.log`
- Stderr log: `.superpowers/sdd/logs/final-api-start.stderr.log`

## API Endpoint Verification

PowerShell flow used:

```powershell
$email = "local-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())@example.com"
$password = 'quiet-breathing-123'
$nickname = 'Local Tester'

$register = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/auth/register' -ContentType 'application/json' -Body (@{
  email = $email
  password = $password
  nickname = $nickname
} | ConvertTo-Json)

$token = $register.data.tokens.accessToken
$methods = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:4000/breathing-methods'
$me = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:4000/me' -Headers @{ Authorization = "Bearer $token" }

$sessionPayload = @{
  clientSessionId = [guid]::NewGuid().Guid
  methodType = 'built_in'
  methodId = 'box'
  customRhythmId = $null
  methodTitleSnapshot = 'Box breathing'
  rhythmSnapshot = @(
    @{ kind='inhale'; label='Inhale'; durationSeconds=4 }
    @{ kind='hold'; label='Hold'; durationSeconds=4 }
    @{ kind='exhale'; label='Exhale'; durationSeconds=4 }
    @{ kind='hold'; label='Hold'; durationSeconds=4 }
  )
  plannedDurationSeconds = 60
  actualDurationSeconds = 60
  completed = $true
  startedAt = '2026-07-08T01:00:00.000Z'
  endedAt = '2026-07-08T01:01:00.000Z'
}

$created = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/practice-sessions' -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body ($sessionPayload | ConvertTo-Json -Depth 5)
$stats = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:4000/stats/summary' -Headers @{ Authorization = "Bearer $token" }
```

Observed results:

- Registration succeeded and returned access/refresh tokens.
- `GET /breathing-methods` returned 3 seeded methods: `box`, `four-seven-eight`, `coherent`.
- `GET /me` returned the newly registered user.
- `POST /practice-sessions` created one session with `actualDurationSeconds = 60`.
- `GET /stats/summary` reflected the session:
  - `totalSessions = 1`
  - `totalPracticeSeconds = 60`
  - `weeklyPracticeSeconds = 60`
  - `recentSessions.length = 1`
- Invalid auth input was also checked with `curl.exe` against `/auth/register`; it returned HTTP `400` with `error.code = VALIDATION_ERROR`.

## Expo / Mobile Boot Verification

Recorded verification command run:

```powershell
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-Command',"`$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:4000'; npm.cmd run dev:mobile -- --non-interactive" -WorkingDirectory (Get-Location) -WindowStyle Hidden -RedirectStandardOutput '.superpowers/sdd/logs/final-mobile.stdout.log' -RedirectStandardError '.superpowers/sdd/logs/final-mobile.stderr.log' -PassThru
```

Human-facing equivalent:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:4000'
npm run dev:mobile -- --non-interactive
```

Observed result:

- Expo started successfully in `apps/mobile`.
- Metro reported `Waiting on http://localhost:8081`.
- The mobile dev server was left running intentionally for local follow-up testing.

Background process state:

- Launcher PID: `32552`
- Metro listener PID: `7220`
- URL: `http://localhost:8081`
- Stdout log: `.superpowers/sdd/logs/final-mobile.stdout.log`
- Stderr log: `.superpowers/sdd/logs/final-mobile.stderr.log`

## Manual Limitations

- This task verified Expo boot/listen only. No device or simulator session was attached in this run, so the in-app register -> practice -> records flow was not executed manually through the UI.
- Expo printed package compatibility warnings for `@types/react`, `babel-preset-expo`, and `typescript`, but Metro still started and listened on `8081`.

## Result

The local vertical slice is verified end-to-end at the service level: PostgreSQL, Prisma, Fastify API auth/current-user/method/session/stats routes, and Expo Metro startup are all working in this worktree.
