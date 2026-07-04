# Interactive Meditation Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully interactive, frontend-only meditation prototype that matches the approved fresh teal immersive breathing layout.

**Architecture:** Use a small TypeScript/Vite app with focused domain modules for breathing timing, practice records, and audio cues. Keep rendering in a single app shell so the prototype is easy to inspect, while keeping timer and storage behavior testable outside the DOM.

**Tech Stack:** Vite, TypeScript, Vitest, jsdom, Testing Library DOM helpers, Web Audio API, localStorage, Phosphor web icons.

---

## File Structure

- Create `package.json`: scripts, dependencies, and dev dependencies.
- Create `tsconfig.json`: strict TypeScript config for browser code and tests.
- Create `vite.config.ts`: Vite + Vitest configuration using jsdom.
- Create `index.html`: app mount and mobile viewport metadata.
- Create `src/domain/breathing.ts`: breathing methods, durations, phase calculation, session clock helpers.
- Create `src/domain/breathing.test.ts`: TDD coverage for phase sequencing, truncated final phases, and session completion.
- Create `src/domain/records.ts`: local practice record persistence and derived stats.
- Create `src/domain/records.test.ts`: TDD coverage for localStorage fallback, streak, weekly minutes, and recent history.
- Create `src/domain/audio.ts`: Web Audio cue player with distinct inhale, hold, exhale, and completion tones.
- Create `src/ui/app.ts`: app state, rendering, user interactions, wall-clock timer loop, and tab/panel behavior.
- Create `src/ui/app.test.ts`: TDD coverage for method selection, start/pause/reset, completion record, and tab rendering.
- Create `src/main.ts`: bootstrap `createMeditationApp`.
- Create `src/styles.css`: responsive polished fresh teal visual design matching the selected mockup.
- Create `design-qa.md`: final Product Design QA report after visual verification.

## Task 1: Project Scaffold And Baseline

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`

- [ ] **Step 1: Add project metadata and scripts**

Create `package.json`:

```json
{
  "name": "easy-meditation",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@phosphor-icons/web": "^2.1.2"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.1",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^24.0.10",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.3",
    "vite": "^7.0.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Add TypeScript and test config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "vite.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true
  }
});
```

- [ ] **Step 3: Add the app shell**

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Easy Meditation</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create starter `src/main.ts`:

```ts
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  root.innerHTML = '<div class="app-loading">Easy Meditation</div>';
}
```

Create starter `src/styles.css`:

```css
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #143336;
  background: #e8f5f2;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: #e8f5f2;
}

.app-loading {
  min-height: 100vh;
  display: grid;
  place-items: center;
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: install completes and creates `package-lock.json`.

- [ ] **Step 5: Verify baseline**

Run: `npm test`

Expected: Vitest exits successfully with no tests or reports no test files depending installed version. If no-test exit is non-zero, add a tiny scaffold smoke test in Task 2 before treating the baseline as ready.

- [ ] **Step 6: Commit scaffold**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts src/styles.css
git commit -m "chore: scaffold meditation prototype"
```

## Task 2: Breathing Timing Domain

**Files:**
- Create: `src/domain/breathing.test.ts`
- Create: `src/domain/breathing.ts`

- [ ] **Step 1: Write failing breathing tests**

Create `src/domain/breathing.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
  BREATHING_METHODS,
  getPhaseAtElapsed,
  getSessionSnapshot,
  secondsToLabel
} from './breathing';

describe('breathing timing', () => {
  test('box breathing advances through four 4-second phases', () => {
    const method = BREATHING_METHODS.box;

    expect(getPhaseAtElapsed(method, 0, 180)).toMatchObject({ label: '吸气', remainingInPhase: 4 });
    expect(getPhaseAtElapsed(method, 4, 180)).toMatchObject({ label: '屏息', remainingInPhase: 4 });
    expect(getPhaseAtElapsed(method, 8, 180)).toMatchObject({ label: '呼气', remainingInPhase: 4 });
    expect(getPhaseAtElapsed(method, 12, 180)).toMatchObject({ label: '屏息', remainingInPhase: 4 });
    expect(getPhaseAtElapsed(method, 16, 180)).toMatchObject({ label: '吸气', remainingInPhase: 4 });
  });

  test('truncates a phase when the session ends before the phase duration', () => {
    const method = BREATHING_METHODS.sleep;

    expect(getPhaseAtElapsed(method, 118, 120)).toMatchObject({
      label: '呼气',
      remainingInPhase: 2,
      remainingInSession: 2,
      isComplete: false
    });
  });

  test('marks the snapshot complete at total duration', () => {
    const snapshot = getSessionSnapshot(BREATHING_METHODS.focus, 120, 120);

    expect(snapshot.isComplete).toBe(true);
    expect(snapshot.remainingInSession).toBe(0);
    expect(snapshot.label).toBe('完成');
  });

  test('formats seconds as minute labels', () => {
    expect(secondsToLabel(180)).toBe('03:00');
    expect(secondsToLabel(61)).toBe('01:01');
    expect(secondsToLabel(5)).toBe('00:05');
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- src/domain/breathing.test.ts`

Expected: FAIL because `src/domain/breathing.ts` does not exist.

- [ ] **Step 3: Implement breathing timing**

Create `src/domain/breathing.ts`:

```ts
export type BreathPhaseKind = 'inhale' | 'hold' | 'exhale' | 'complete';

export type BreathPhase = {
  kind: BreathPhaseKind;
  label: string;
  durationSeconds: number;
};

export type BreathingMethod = {
  id: 'box' | 'focus' | 'sleep';
  title: string;
  subtitle: string;
  defaultMinutes: number;
  phases: BreathPhase[];
};

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

export const BREATHING_METHODS: Record<BreathingMethod['id'], BreathingMethod> = {
  box: {
    id: 'box',
    title: '盒式呼吸',
    subtitle: '吸气 · 屏息 · 呼气 · 屏息',
    defaultMinutes: 3,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 4 },
      { kind: 'exhale', label: '呼气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 4 }
    ]
  },
  focus: {
    id: 'focus',
    title: '专注恢复',
    subtitle: '短屏息，长呼气',
    defaultMinutes: 2,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 4 },
      { kind: 'hold', label: '停留', durationSeconds: 2 },
      { kind: 'exhale', label: '呼气', durationSeconds: 6 }
    ]
  },
  sleep: {
    id: 'sleep',
    title: '睡前降速',
    subtitle: '慢慢拉长呼气',
    defaultMinutes: 5,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 4 },
      { kind: 'exhale', label: '呼气', durationSeconds: 8 }
    ]
  }
};

export const DURATIONS_MINUTES = [2, 3, 5, 10] as const;

export function getSessionSnapshot(
  method: BreathingMethod,
  elapsedSeconds: number,
  totalSeconds: number
): SessionSnapshot {
  const normalizedElapsed = Math.max(0, Math.floor(elapsedSeconds));
  if (normalizedElapsed >= totalSeconds) {
    return {
      kind: 'complete',
      label: '完成',
      phaseIndex: method.phases.length - 1,
      phaseProgress: 1,
      remainingInPhase: 0,
      remainingInSession: 0,
      elapsedSeconds: totalSeconds,
      isComplete: true
    };
  }

  return getPhaseAtElapsed(method, normalizedElapsed, totalSeconds);
}

export function getPhaseAtElapsed(
  method: BreathingMethod,
  elapsedSeconds: number,
  totalSeconds: number
): SessionSnapshot {
  const cycleSeconds = method.phases.reduce((sum, phase) => sum + phase.durationSeconds, 0);
  let cycleElapsed = Math.max(0, Math.floor(elapsedSeconds)) % cycleSeconds;
  const remainingInSession = Math.max(0, totalSeconds - Math.floor(elapsedSeconds));

  for (let index = 0; index < method.phases.length; index += 1) {
    const phase = method.phases[index];
    if (cycleElapsed < phase.durationSeconds) {
      const phaseRemaining = phase.durationSeconds - cycleElapsed;
      return {
        kind: phase.kind,
        label: phase.label,
        phaseIndex: index,
        phaseProgress: cycleElapsed / phase.durationSeconds,
        remainingInPhase: Math.min(phaseRemaining, remainingInSession),
        remainingInSession,
        elapsedSeconds: Math.max(0, Math.floor(elapsedSeconds)),
        isComplete: false
      };
    }

    cycleElapsed -= phase.durationSeconds;
  }

  return getSessionSnapshot(method, elapsedSeconds, totalSeconds);
}

export function secondsToLabel(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `npm test -- src/domain/breathing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit timing domain**

```bash
git add src/domain/breathing.ts src/domain/breathing.test.ts
git commit -m "feat: add breathing timing domain"
```

## Task 3: Practice Records Domain

**Files:**
- Create: `src/domain/records.test.ts`
- Create: `src/domain/records.ts`

- [ ] **Step 1: Write failing records tests**

Create `src/domain/records.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createMemoryStorage,
  createPracticeStore,
  derivePracticeStats
} from './records';

describe('practice records', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-04T12:00:00+08:00'));
  });

  test('saves completed sessions and shows newest records first', () => {
    const store = createPracticeStore(createMemoryStorage());

    store.addCompletedSession({ methodId: 'box', methodTitle: '盒式呼吸', minutes: 3 });
    store.addCompletedSession({ methodId: 'focus', methodTitle: '专注恢复', minutes: 2 });

    const records = store.getRecords();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ methodId: 'focus', minutes: 2 });
    expect(records[1]).toMatchObject({ methodId: 'box', minutes: 3 });
  });

  test('derives total sessions, weekly minutes, and current streak', () => {
    const today = new Date('2026-07-04T12:00:00+08:00').toISOString();
    const yesterday = new Date('2026-07-03T12:00:00+08:00').toISOString();
    const twoDaysAgo = new Date('2026-07-02T12:00:00+08:00').toISOString();

    const stats = derivePracticeStats([
      { id: '1', methodId: 'box', methodTitle: '盒式呼吸', minutes: 3, completedAt: today },
      { id: '2', methodId: 'focus', methodTitle: '专注恢复', minutes: 2, completedAt: yesterday },
      { id: '3', methodId: 'sleep', methodTitle: '睡前降速', minutes: 5, completedAt: twoDaysAgo }
    ], new Date('2026-07-04T14:00:00+08:00'));

    expect(stats.totalSessions).toBe(3);
    expect(stats.weeklyMinutes).toBe(10);
    expect(stats.currentStreak).toBe(3);
    expect(stats.recentRecords).toHaveLength(3);
  });

  test('uses memory storage when browser storage is unavailable', () => {
    const storage = createMemoryStorage();
    storage.setItem('x', '1');

    expect(storage.getItem('x')).toBe('1');
    storage.removeItem('x');
    expect(storage.getItem('x')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- src/domain/records.test.ts`

Expected: FAIL because `src/domain/records.ts` does not exist.

- [ ] **Step 3: Implement records domain**

Create `src/domain/records.ts`:

```ts
export type PracticeRecord = {
  id: string;
  methodId: string;
  methodTitle: string;
  minutes: number;
  completedAt: string;
};

export type PracticeStats = {
  totalSessions: number;
  completedMinutes: number;
  weeklyMinutes: number;
  currentStreak: number;
  recentRecords: PracticeRecord[];
};

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'easy-meditation.records.v1';

export function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

export function createPracticeStore(storage: StorageLike = safeStorage()) {
  function getRecords(): PracticeRecord[] {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as PracticeRecord[];
      return Array.isArray(parsed)
        ? parsed.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
        : [];
    } catch {
      return [];
    }
  }

  function saveRecords(records: PracticeRecord[]) {
    storage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  return {
    getRecords,
    getStats: (now = new Date()) => derivePracticeStats(getRecords(), now),
    addCompletedSession(input: Pick<PracticeRecord, 'methodId' | 'methodTitle' | 'minutes'>) {
      const record: PracticeRecord = {
        ...input,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        completedAt: new Date().toISOString()
      };
      saveRecords([record, ...getRecords()]);
      return record;
    },
    clear() {
      storage.removeItem(STORAGE_KEY);
    }
  };
}

export function derivePracticeStats(records: PracticeRecord[], now = new Date()): PracticeStats {
  const sorted = [...records].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const weekStartMs = startOfLocalDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)).getTime();
  const weeklyMinutes = sorted
    .filter((record) => Date.parse(record.completedAt) >= weekStartMs)
    .reduce((sum, record) => sum + record.minutes, 0);

  return {
    totalSessions: sorted.length,
    completedMinutes: sorted.reduce((sum, record) => sum + record.minutes, 0),
    weeklyMinutes,
    currentStreak: calculateCurrentStreak(sorted, now),
    recentRecords: sorted.slice(0, 5)
  };
}

function calculateCurrentStreak(records: PracticeRecord[], now: Date): number {
  const practiceDays = new Set(records.map((record) => localDateKey(new Date(record.completedAt))));
  let cursor = startOfLocalDay(now);
  let streak = 0;

  while (practiceDays.has(localDateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  return streak;
}

function safeStorage(): StorageLike {
  try {
    const storage = window.localStorage;
    const testKey = '__easy_meditation_test__';
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return storage;
  } catch {
    return createMemoryStorage();
  }
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `npm test -- src/domain/records.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit records domain**

```bash
git add src/domain/records.ts src/domain/records.test.ts
git commit -m "feat: add practice record storage"
```

## Task 4: Interactive App Shell

**Files:**
- Create: `src/domain/audio.ts`
- Create: `src/ui/app.test.ts`
- Create: `src/ui/app.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Write failing UI interaction tests**

Create `src/ui/app.test.ts`:

```ts
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryStorage } from '../domain/records';
import { createMeditationApp } from './app';

describe('meditation app interactions', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T12:00:00+08:00'));
  });

  test('starts, pauses, and resumes a box breathing session', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createMeditationApp(document.querySelector('#app')!, { storage: createMemoryStorage(), audioEnabled: false });

    await user.click(screen.getByRole('button', { name: '开始' }));
    expect(screen.getByText('吸气')).toBeTruthy();

    vi.advanceTimersByTime(4000);
    expect(screen.getByText('屏息')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '暂停' }));
    vi.advanceTimersByTime(8000);
    expect(screen.getByText('屏息')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '继续' }));
    vi.advanceTimersByTime(4000);
    expect(screen.getByText('呼气')).toBeTruthy();
  });

  test('changes method and duration from controls', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createMeditationApp(document.querySelector('#app')!, { storage: createMemoryStorage(), audioEnabled: false });

    await user.click(screen.getByRole('button', { name: '调整练习' }));
    await user.click(screen.getByRole('button', { name: '睡前降速' }));
    await user.click(screen.getByRole('button', { name: '5 分钟' }));

    expect(screen.getByText('5 分钟睡前降速')).toBeTruthy();
  });

  test('completion saves a record and updates stats', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const storage = createMemoryStorage();
    createMeditationApp(document.querySelector('#app')!, { storage, audioEnabled: false, initialDurationMinutes: 2 });

    await user.click(screen.getByRole('button', { name: '开始' }));
    vi.advanceTimersByTime(120000);

    expect(screen.getByText('完成')).toBeTruthy();
    expect(screen.getByText('本周 2 分钟')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- src/ui/app.test.ts`

Expected: FAIL because `src/ui/app.ts` does not exist.

- [ ] **Step 3: Implement the audio module and app shell**

Create `src/domain/audio.ts`:

```ts
type CueKind = string;

type CuePlayerOptions = {
  enabled: boolean;
};

export function createCuePlayer(options: CuePlayerOptions) {
  let context: AudioContext | null = null;

  function getContext() {
    if (!options.enabled) return null;
    context ??= new AudioContext();
    return context;
  }

  function unlock() {
    void getContext()?.resume();
  }

  function play(kind: CueKind) {
    const audio = getContext();
    if (!audio) return;

    const now = audio.currentTime;
    const gain = audio.createGain();
    const oscillator = audio.createOscillator();
    const { from, to, duration } = cueShape(kind);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  return { unlock, play };
}

function cueShape(kind: CueKind) {
  if (kind === 'inhale') return { from: 392, to: 587, duration: 0.42 };
  if (kind === 'hold') return { from: 523, to: 523, duration: 0.32 };
  if (kind === 'exhale') return { from: 440, to: 294, duration: 0.5 };
  if (kind === 'complete') return { from: 440, to: 660, duration: 0.68 };
  return { from: 392, to: 392, duration: 0.26 };
}
```

Create `src/ui/app.ts` with:

```ts
import '@phosphor-icons/web/regular';
import {
  BREATHING_METHODS,
  DURATIONS_MINUTES,
  BreathingMethod,
  getSessionSnapshot,
  secondsToLabel
} from '../domain/breathing';
import { createCuePlayer } from '../domain/audio';
import { createPracticeStore, StorageLike } from '../domain/records';

type AppStatus = 'idle' | 'running' | 'paused' | 'completed';

type AppOptions = {
  storage?: StorageLike;
  audioEnabled?: boolean;
  initialDurationMinutes?: number;
};

export function createMeditationApp(root: Element, options: AppOptions = {}) {
  const store = createPracticeStore(options.storage);
  const cuePlayer = createCuePlayer({ enabled: options.audioEnabled ?? true });
  const state = {
    method: BREATHING_METHODS.box,
    durationMinutes: options.initialDurationMinutes ?? BREATHING_METHODS.box.defaultMinutes,
    status: 'idle' as AppStatus,
    elapsedBeforeRun: 0,
    runStartedAt: 0,
    controlsOpen: false,
    tab: 'practice' as 'practice' | 'favorites' | 'records',
    lastCueKey: ''
  };

  let frame = 0;

  function elapsedSeconds() {
    if (state.status !== 'running') return state.elapsedBeforeRun;
    return state.elapsedBeforeRun + Math.floor((Date.now() - state.runStartedAt) / 1000);
  }

  function totalSeconds() {
    return state.durationMinutes * 60;
  }

  function render() {
    const stats = store.getStats();
    const snapshot = getSessionSnapshot(state.method, elapsedSeconds(), totalSeconds());
    const primaryLabel = state.status === 'running' ? '暂停' : state.status === 'paused' ? '继续' : '开始';
    const title = `${state.durationMinutes} 分钟${state.method.title}`;

    root.innerHTML = `
      <section class="app-frame">
        <div class="phone-shell">
          <div class="screen">
            <div class="top-line">
              <span>${state.status === 'running' ? '跟着节奏走' : '下午好，先慢下来'}</span>
              <span class="stat-chip">${stats.currentStreak} 天连续</span>
            </div>
            ${renderTab(snapshot, title, primaryLabel, stats.weeklyMinutes)}
            <nav class="bottom-nav" aria-label="主导航">
              ${navButton('practice', '练习', 'ph-wind')}
              ${navButton('favorites', '收藏', 'ph-heart')}
              ${navButton('records', '记录', 'ph-chart-line-up')}
            </nav>
          </div>
        </div>
      </section>
    `;

    bindEvents();

    if (state.status === 'running') {
      cueIfNeeded(snapshot.kind, snapshot.phaseIndex);
      if (snapshot.isComplete) completeSession();
      else frame = window.setTimeout(render, 250);
    }
  }

  function renderTab(snapshot: ReturnType<typeof getSessionSnapshot>, title: string, primaryLabel: string, weeklyMinutes: number) {
    if (state.tab === 'favorites') return renderFavorites();
    if (state.tab === 'records') return renderRecords();

    return `
      <div class="practice-view">
        <div class="headline">
          <span>今日推荐</span>
          <h1>${title}</h1>
        </div>
        <div class="breath-stage breath-${snapshot.kind}">
          <div class="orb" style="--phase-progress:${snapshot.phaseProgress}">
            <strong>${snapshot.label}</strong>
            <span>${snapshot.remainingInPhase} 秒</span>
          </div>
        </div>
        <section class="control-panel">
          <div class="control-meta">
            <div>
              <strong>声音：柔和提示</strong>
              <span>${state.method.subtitle}</span>
            </div>
            <time>${secondsToLabel(snapshot.remainingInSession)}</time>
          </div>
          <div class="phase-bars">
            ${state.method.phases.map((_, index) => `<span class="${index === snapshot.phaseIndex ? 'active' : ''}"></span>`).join('')}
          </div>
          <div class="action-row">
            <button class="icon-button secondary" data-action="reset" aria-label="重置"><i class="ph ph-arrow-counter-clockwise"></i></button>
            <button class="primary-action" data-action="primary">${primaryLabel}</button>
            <button class="icon-button secondary" data-action="toggle-controls" aria-label="调整练习"><i class="ph ph-sliders-horizontal"></i></button>
          </div>
          ${state.controlsOpen ? renderControls() : ''}
          <p class="week-note">本周 ${weeklyMinutes} 分钟</p>
        </section>
      </div>
    `;
  }

  function renderControls() {
    return `
      <div class="settings-panel">
        <div class="choice-row">${Object.values(BREATHING_METHODS).map(methodButton).join('')}</div>
        <div class="choice-row">${DURATIONS_MINUTES.map(durationButton).join('')}</div>
      </div>
    `;
  }

  function methodButton(method: BreathingMethod) {
    return `<button data-method="${method.id}" class="${state.method.id === method.id ? 'selected' : ''}">${method.title}</button>`;
  }

  function durationButton(minutes: number) {
    return `<button data-duration="${minutes}" class="${state.durationMinutes === minutes ? 'selected' : ''}">${minutes} 分钟</button>`;
  }

  function renderFavorites() {
    return `<section class="list-view"><h1>常用节奏</h1>${Object.values(BREATHING_METHODS).map((method) => `<button data-method="${method.id}"><strong>${method.title}</strong><span>${method.subtitle}</span></button>`).join('')}</section>`;
  }

  function renderRecords() {
    const stats = store.getStats();
    return `<section class="list-view"><h1>练习记录</h1><div class="stats-grid"><b>${stats.currentStreak}<span>连续天数</span></b><b>${stats.weeklyMinutes}<span>本周分钟</span></b><b>${stats.totalSessions}<span>完成次数</span></b></div>${stats.recentRecords.map((record) => `<div class="record-row"><strong>${record.methodTitle}</strong><span>${record.minutes} 分钟</span></div>`).join('') || '<p class="empty">完成一次练习后会出现在这里</p>'}</section>`;
  }

  function navButton(tab: typeof state.tab, label: string, icon: string) {
    return `<button data-tab="${tab}" class="${state.tab === tab ? 'active' : ''}"><i class="ph ${icon}"></i><span>${label}</span></button>`;
  }

  function bindEvents() {
    root.querySelector('[data-action="primary"]')?.addEventListener('click', primaryAction);
    root.querySelector('[data-action="reset"]')?.addEventListener('click', reset);
    root.querySelector('[data-action="toggle-controls"]')?.addEventListener('click', () => {
      state.controlsOpen = !state.controlsOpen;
      render();
    });
    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((button) => button.addEventListener('click', () => {
      state.tab = button.dataset.tab as typeof state.tab;
      render();
    }));
    root.querySelectorAll<HTMLElement>('[data-method]').forEach((button) => button.addEventListener('click', () => {
      state.method = BREATHING_METHODS[button.dataset.method as keyof typeof BREATHING_METHODS];
      state.durationMinutes = state.method.defaultMinutes;
      state.status = 'idle';
      state.elapsedBeforeRun = 0;
      render();
    }));
    root.querySelectorAll<HTMLElement>('[data-duration]').forEach((button) => button.addEventListener('click', () => {
      state.durationMinutes = Number(button.dataset.duration);
      state.status = 'idle';
      state.elapsedBeforeRun = 0;
      render();
    }));
  }

  function primaryAction() {
    if (state.status === 'running') {
      state.elapsedBeforeRun = elapsedSeconds();
      state.status = 'paused';
    } else {
      state.status = 'running';
      state.runStartedAt = Date.now();
      cuePlayer.unlock();
    }
    render();
  }

  function reset() {
    window.clearTimeout(frame);
    state.status = 'idle';
    state.elapsedBeforeRun = 0;
    state.lastCueKey = '';
    render();
  }

  function completeSession() {
    window.clearTimeout(frame);
    if (state.status !== 'completed') {
      store.addCompletedSession({ methodId: state.method.id, methodTitle: state.method.title, minutes: state.durationMinutes });
      cuePlayer.play('complete');
    }
    state.status = 'completed';
    state.elapsedBeforeRun = totalSeconds();
    render();
  }

  function cueIfNeeded(kind: string, phaseIndex: number) {
    const key = `${kind}-${phaseIndex}-${Math.floor(elapsedSeconds())}`;
    if (key !== state.lastCueKey) {
      state.lastCueKey = key;
      cuePlayer.play(kind);
    }
  }

  render();
  return { destroy: () => window.clearTimeout(frame) };
}
```

Modify `src/main.ts`:

```ts
import './styles.css';
import { createMeditationApp } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  createMeditationApp(root);
}
```

- [ ] **Step 4: Run UI tests to verify GREEN**

Run: `npm test -- src/ui/app.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit interactive shell**

```bash
git add src/domain/audio.ts src/ui/app.ts src/ui/app.test.ts src/main.ts
git commit -m "feat: add interactive meditation app shell"
```

## Task 5: Automated Build Check

**Files:**
- Modify: none

- [ ] **Step 1: Run tests and build**

Run: `npm test && npm run build`

Expected: PASS and production build succeeds.

- [ ] **Step 2: Leave working tree unchanged**

Run: `git status --short -uall`

Expected: no source changes from this verification task.

## Task 6: Polished Fresh Teal UI

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace starter CSS with the selected visual design**

Update `src/styles.css` to implement:

```css
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #143336;
  background: #e6f3f0;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* { box-sizing: border-box; }

button {
  border: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: #e6f3f0;
}

.app-frame {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 28px;
}

.phone-shell {
  width: min(100%, 390px);
  min-height: min(820px, calc(100vh - 56px));
  border-radius: 38px;
  background: #12393b;
  padding: 10px;
  box-shadow: 0 28px 72px rgba(24, 70, 69, .22);
}

.screen {
  min-height: calc(min(820px, 100vh - 56px) - 20px);
  border-radius: 30px;
  overflow: hidden;
  padding: 24px 22px 18px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #effaf7 0%, #e4f2ef 48%, #d8ebe7 100%);
}

.top-line,
.control-meta,
.action-row,
.bottom-nav,
.stats-grid {
  display: flex;
  align-items: center;
}

.top-line {
  justify-content: space-between;
  min-height: 32px;
  font-size: 13px;
  color: rgba(20, 51, 54, .68);
}

.stat-chip {
  min-width: 64px;
  min-height: 30px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, .76);
  color: #2f746c;
  font-weight: 650;
  box-shadow: 0 8px 20px rgba(55, 94, 91, .09);
}

.practice-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.headline {
  margin-top: 22px;
}

.headline span {
  display: block;
  font-size: 12px;
  color: #4f7773;
}

.headline h1,
.list-view h1 {
  margin: 6px 0 0;
  font-size: 26px;
  line-height: 1.12;
  font-weight: 680;
  letter-spacing: 0;
}

.breath-stage {
  flex: 1;
  min-height: 250px;
  display: grid;
  place-items: center;
}

.orb {
  width: 205px;
  height: 205px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  text-align: center;
  background: radial-gradient(circle at 36% 26%, #ffffff 0%, #d8f1eb 48%, #88c8bf 100%);
  box-shadow:
    0 0 0 24px rgba(255, 255, 255, .48),
    0 22px 52px rgba(60, 126, 120, .18);
  color: #123c3d;
  transform: scale(.92);
  transition: transform 1000ms ease-in-out;
}

.breath-inhale .orb { transform: scale(1); }
.breath-hold .orb { transform: scale(.98); }
.breath-exhale .orb { transform: scale(.82); }
.breath-complete .orb { background: #f2d8b8; }

.orb strong {
  display: block;
  font-size: 34px;
  line-height: 1;
  font-weight: 680;
}

.orb span {
  display: block;
  margin-top: 10px;
  font-size: 13px;
  color: rgba(18, 60, 61, .7);
}

.control-panel {
  border-radius: 24px;
  padding: 15px;
  background: rgba(255, 255, 255, .78);
  border: 1px solid rgba(255, 255, 255, .9);
  box-shadow: 0 16px 36px rgba(71, 101, 99, .12);
}

.control-meta {
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
}

.control-meta strong,
.control-meta span {
  display: block;
}

.control-meta strong {
  font-size: 14px;
  font-weight: 680;
}

.control-meta span,
.week-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: #5b807b;
}

.control-meta time {
  font-size: 22px;
  font-weight: 680;
  color: #245e59;
  white-space: nowrap;
}

.phase-bars {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 7px;
  min-height: 4px;
}

.phase-bars span {
  height: 4px;
  border-radius: 999px;
  background: #c7ded9;
}

.phase-bars span.active {
  background: #3d8278;
}

.action-row {
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

.primary-action {
  min-width: 138px;
  height: 52px;
  border-radius: 999px;
  background: #245e59;
  color: #f6fbf9;
  font-weight: 700;
  box-shadow: 0 14px 30px rgba(36, 94, 89, .24);
}

.icon-button {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #edf7f4;
  color: #245e59;
}

.icon-button i,
.bottom-nav i {
  font-size: 21px;
}

.settings-panel {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}

.choice-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.choice-row button,
.list-view button,
.record-row {
  min-height: 42px;
  border-radius: 8px;
  background: rgba(237, 247, 244, .86);
  color: #245e59;
  padding: 9px 10px;
}

.choice-row button.selected {
  background: #245e59;
  color: #f6fbf9;
}

.bottom-nav {
  justify-content: space-around;
  gap: 8px;
  margin-top: 16px;
  min-height: 58px;
  border-radius: 24px;
  background: rgba(255, 255, 255, .48);
}

.bottom-nav button {
  min-width: 72px;
  display: grid;
  place-items: center;
  gap: 3px;
  background: transparent;
  color: rgba(20, 51, 54, .58);
  font-size: 11px;
}

.bottom-nav button.active {
  color: #245e59;
  font-weight: 700;
}

.list-view {
  flex: 1;
  min-height: 0;
  padding-top: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.list-view button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
}

.list-view button strong,
.record-row strong {
  font-size: 14px;
}

.list-view button span,
.record-row span,
.empty {
  font-size: 12px;
  color: #5b807b;
}

.stats-grid {
  justify-content: space-between;
  gap: 9px;
}

.stats-grid b {
  flex: 1;
  min-height: 72px;
  border-radius: 8px;
  background: rgba(255, 255, 255, .68);
  display: grid;
  place-items: center;
  font-size: 22px;
}

.stats-grid b span {
  display: block;
  font-size: 10px;
  font-weight: 500;
  color: #5b807b;
}

.record-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

@media (max-width: 520px) {
  .app-frame {
    padding: 0;
  }

  .phone-shell {
    width: 100%;
    min-height: 100vh;
    border-radius: 0;
    padding: 0;
    box-shadow: none;
  }

  .screen {
    min-height: 100vh;
    border-radius: 0;
  }
}
```

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Commit visual polish**

```bash
git add src/styles.css
git commit -m "style: polish fresh teal meditation UI"
```

## Task 7: Local Verification And Design QA

**Files:**
- Create: `design-qa.md`

- [ ] **Step 1: Run full automated verification**

Run: `npm test && npm run build`

Expected: all tests pass and build succeeds.

- [ ] **Step 2: Start local dev server**

Run: `npm run dev -- --port 5173`

Expected: Vite serves the prototype at `http://127.0.0.1:5173/`. If port 5173 is busy, use the next free port.

- [ ] **Step 3: Capture desktop and mobile views**

Use the in-app browser to open the local URL. Capture:

- Desktop viewport around 1280 x 900.
- Mobile viewport around 390 x 844.

Expected: app is visible, nonblank, centered, and no text overlaps.

- [ ] **Step 4: Compare against selected visual target**

Use the selected mockup direction:

- Fresh pale teal palette.
- Immersive centered orb.
- Short recommendation headline.
- Compact control panel.
- Simple bottom navigation.

Write `design-qa.md`:

```markdown
# Design QA

final result: passed

## Reference

Selected direction: B fresh daily color palette plus A immersive start layout from the brainstorming mockup.

## Checks

- Mobile layout: passed.
- Desktop framing: passed.
- Breathing orb prominence: passed.
- Method and duration controls: passed.
- Start, pause, reset interaction: passed.
- Records view: passed.
- Text overlap: passed.

## Notes

No blocking visual issues remain.
```

- [ ] **Step 5: Resolve blocking QA issues**

For every P0/P1/P2 issue listed in `design-qa.md`, edit the affected source file, rerun `npm test && npm run build`, recapture the same viewport, and update `design-qa.md` until `final result: passed`.

- [ ] **Step 6: Commit QA**

```bash
git add design-qa.md
git commit -m "test: verify meditation prototype design"
```

## Self-Review

- Spec coverage: breathing methods, duration choices, start/pause/reset, wall-clock timer, audio cues, local records, stats, responsive layout, and selected visual direction are covered.
- Ambiguity scan: every task names concrete files, commands, and pass/fail expectations.
- Type consistency: method ids are `box`, `focus`, and `sleep`; app state uses these ids consistently.
- Scope check: accounts, cloud sync, long courses, subscriptions, and social features remain out of scope.
