import { describe, expect, it, vi } from 'vitest';
import type { BreathingPhase } from '@easy-meditation/shared';
import type { StateStorage } from 'zustand/middleware';

import { redistributeCycleSeconds } from '../domain/customRhythm';
import type { LocalSessionLedgerEntry } from '../domain/sessionLedger';
import {
  DEFAULT_PREFERENCES,
  createUserPreferencesStore,
  hydrateUserPreferencesStore,
  preferencesStorageKey,
  type UserPreferencesState
} from './preferencesStore';

type PersistedPreferences = Pick<
  UserPreferencesState,
  | 'customRhythm'
  | 'durationOverrides'
  | 'soundEnabled'
  | 'beforeStartDismissed'
  | 'localSessionLedger'
>;

type CustomLedgerEntry = Extract<LocalSessionLedgerEntry, { origin: 'custom' }>;
type RetryableLedgerEntry = Extract<
  LocalSessionLedgerEntry,
  { attemptCount: number }
>;

const rhythmSnapshot: BreathingPhase[] = [
  { kind: 'inhale', label: '吸气', durationSeconds: 4 },
  { kind: 'hold', label: '停留', durationSeconds: 4 },
  { kind: 'exhale', label: '呼气', durationSeconds: 4 }
];

function customLedgerEntry(
  clientSessionId = '11111111-1111-4111-8111-111111111111'
): CustomLedgerEntry {
  return {
    clientSessionId,
    methodType: 'custom',
    methodId: null,
    customRhythmId: null,
    methodTitleSnapshot: '自定义',
    rhythmSnapshot,
    plannedDurationSeconds: 300,
    actualDurationSeconds: 299,
    completed: true,
    startedAt: '2026-07-08T10:00:00.000Z',
    endedAt: '2026-07-08T10:05:00.000Z',
    origin: 'custom',
    state: 'local-only'
  };
}

function pendingLedgerEntry(
  clientSessionId = '22222222-2222-4222-8222-222222222222'
): RetryableLedgerEntry {
  return {
    clientSessionId,
    methodType: 'built_in',
    methodId: 'box',
    customRhythmId: null,
    methodTitleSnapshot: '盒式呼吸法',
    rhythmSnapshot,
    plannedDurationSeconds: 300,
    actualDurationSeconds: 300,
    completed: true,
    startedAt: '2026-07-08T11:00:00.000Z',
    endedAt: '2026-07-08T11:05:00.000Z',
    origin: 'built_in',
    state: 'pending',
    attemptCount: 0,
    nextAttemptAt: null,
    lastErrorCode: null
  };
}

function persistedPayload(state: Record<string, unknown>) {
  return JSON.stringify({ state, version: 0 });
}

function createMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const reads: string[] = [];
  const writes: Array<{ name: string; value: string }> = [];
  const removals: string[] = [];
  const storage: StateStorage = {
    async getItem(name) {
      reads.push(name);
      return values.get(name) ?? null;
    },
    async setItem(name, value) {
      writes.push({ name, value });
      values.set(name, value);
    },
    async removeItem(name) {
      removals.push(name);
      values.delete(name);
    }
  };

  return { storage, values, reads, writes, removals };
}

function readPersisted(storage: ReturnType<typeof createMemoryStorage>, userId: string) {
  const value = storage.values.get(preferencesStorageKey(userId));
  expect(value).toBeDefined();
  return JSON.parse(value!) as { state: PersistedPreferences; version: number };
}

describe('user preferences persistence', () => {
  it('starts every user store with exact, isolated defaults', () => {
    const first = createUserPreferencesStore('user-a', createMemoryStorage().storage);
    const second = createUserPreferencesStore('user-b', createMemoryStorage().storage);

    expect({
      customRhythm: first.getState().customRhythm,
      durationOverrides: first.getState().durationOverrides,
      soundEnabled: first.getState().soundEnabled,
      beforeStartDismissed: first.getState().beforeStartDismissed,
      localSessionLedger: first.getState().localSessionLedger
    }).toEqual(DEFAULT_PREFERENCES);
    expect(first.getState().customRhythm).not.toBe(second.getState().customRhythm);
    expect(first.getState().durationOverrides).not.toBe(second.getState().durationOverrides);
    expect(first.getState().localSessionLedger).not.toBe(second.getState().localSessionLedger);
  });

  it('uses a distinct storage key per account and never reads a global key', async () => {
    const memory = createMemoryStorage();
    const first = createUserPreferencesStore('user-a', memory.storage);
    const second = createUserPreferencesStore('user-b', memory.storage);

    expect(preferencesStorageKey('user-a')).toBe('easyMeditation.preferences.user-a');
    expect(preferencesStorageKey('user-b')).toBe('easyMeditation.preferences.user-b');

    await hydrateUserPreferencesStore(first);
    await hydrateUserPreferencesStore(second);

    expect(memory.reads).toEqual([
      'easyMeditation.preferences.user-a',
      'easyMeditation.preferences.user-b'
    ]);
    expect(memory.reads).not.toContain('easyMeditation.preferences');
  });

  it('awaits persistence for every preferences mutation and stores only five slices', async () => {
    const userId = 'settings-user';
    const memory = createMemoryStorage();
    const store = createUserPreferencesStore(userId, memory.storage);

    await store.getState().setCustomPhase('inhaleSeconds', 7);
    expect(readPersisted(memory, userId).state.customRhythm.inhaleSeconds).toBe(7);

    const beforeCycle = store.getState().customRhythm;
    await store.getState().setCustomCycleSeconds(18);
    expect(readPersisted(memory, userId).state.customRhythm).toEqual({
      ...beforeCycle,
      ...redistributeCycleSeconds(beforeCycle, 18)
    });

    await store.getState().setCustomDuration(10);
    expect(readPersisted(memory, userId).state.customRhythm.durationMinutes).toBe(10);

    await store.getState().setDurationOverride('box', 8);
    expect(readPersisted(memory, userId).state.durationOverrides).toEqual({ box: 8 });

    await store.getState().setSoundEnabled(false);
    expect(readPersisted(memory, userId).state.soundEnabled).toBe(false);

    await store.getState().dismissBeforeStart();
    const persisted = readPersisted(memory, userId);
    expect(persisted.state.beforeStartDismissed).toBe(true);
    expect(Object.keys(persisted.state).sort()).toEqual([
      'beforeStartDismissed',
      'customRhythm',
      'durationOverrides',
      'localSessionLedger',
      'soundEnabled'
    ]);
    expect(memory.writes).toHaveLength(6);
  });

  it('rolls back before-start dismissal when persistence fails', async () => {
    const values = new Map<string, string>();
    let writeAttempts = 0;
    const storage: StateStorage = {
      async getItem(name) {
        return values.get(name) ?? null;
      },
      async setItem(name, value) {
        writeAttempts += 1;
        if (writeAttempts === 1) {
          throw new Error('storage unavailable');
        }
        values.set(name, value);
      },
      async removeItem(name) {
        values.delete(name);
      }
    };
    const userId = 'dismiss-rollback';
    const store = createUserPreferencesStore(userId, storage);

    await expect(store.getState().dismissBeforeStart()).rejects.toThrow(
      'storage unavailable'
    );

    expect(store.getState().beforeStartDismissed).toBe(false);
    expect(writeAttempts).toBe(2);
    expect(
      JSON.parse(values.get(preferencesStorageKey(userId))!).state
        .beforeStartDismissed
    ).toBe(false);
  });

  it('rejects a custom duration override before changing state or writing', async () => {
    const memory = createMemoryStorage();
    const store = createUserPreferencesStore('invalid-override', memory.storage);

    await expect(store.getState().setDurationOverride('custom', 8)).rejects.toThrow(
      /custom/i
    );

    expect(store.getState().durationOverrides).toEqual({});
    expect(memory.writes).toHaveLength(0);
  });

  it('deduplicates ledger puts by clientSessionId and persists a fresh replacement', async () => {
    const memory = createMemoryStorage();
    const store = createUserPreferencesStore('ledger-dedupe', memory.storage);
    const original = pendingLedgerEntry();
    const replacement: LocalSessionLedgerEntry = {
      ...original,
      state: 'retry-paused',
      attemptCount: 1,
      nextAttemptAt: '2026-07-08T11:06:00.000Z',
      lastErrorCode: 'NETWORK_ERROR'
    };

    await store.getState().putLedgerEntry(original);
    await store.getState().putLedgerEntry(replacement);

    expect(store.getState().localSessionLedger).toEqual([replacement]);
    expect(store.getState().localSessionLedger[0]).not.toBe(replacement);
    expect(memory.writes).toHaveLength(2);
    expect(readPersisted(memory, 'ledger-dedupe').state.localSessionLedger).toEqual([
      replacement
    ]);
  });

  it('inserts, updates, and removes ledger rows with promised persistence', async () => {
    const memory = createMemoryStorage();
    const store = createUserPreferencesStore('ledger-crud', memory.storage);
    const custom = customLedgerEntry();
    const pending = pendingLedgerEntry();

    await store.getState().putLedgerEntry(custom);
    await store.getState().putLedgerEntry(pending);
    expect(readPersisted(memory, 'ledger-crud').state.localSessionLedger).toEqual([
      custom,
      pending
    ]);

    await store.getState().updateLedgerEntry(pending.clientSessionId, (current) => {
      if (current.origin !== 'built_in') throw new Error('Expected built-in row.');
      return {
        ...current,
        state: 'failed-terminal',
        lastErrorCode: 'INVALID_SESSION'
      };
    });
    expect(readPersisted(memory, 'ledger-crud').state.localSessionLedger[1]).toMatchObject({
      clientSessionId: pending.clientSessionId,
      state: 'failed-terminal',
      lastErrorCode: 'INVALID_SESSION'
    });

    await store.getState().removeLedgerEntry(custom.clientSessionId);
    expect(store.getState().localSessionLedger).toHaveLength(1);
    expect(readPersisted(memory, 'ledger-crud').state.localSessionLedger).toHaveLength(1);
    expect(memory.writes).toHaveLength(4);
  });

  it('recovers only an invalid custom rhythm slice during hydration', async () => {
    const userId = 'bad-custom';
    const validLedger = customLedgerEntry();
    const memory = createMemoryStorage({
      [preferencesStorageKey(userId)]: persistedPayload({
        customRhythm: {
          ...DEFAULT_PREFERENCES.customRhythm,
          inhaleSeconds: 0
        },
        durationOverrides: { box: 12 },
        soundEnabled: false,
        beforeStartDismissed: true,
        localSessionLedger: [validLedger]
      })
    });
    const store = createUserPreferencesStore(userId, memory.storage);

    await hydrateUserPreferencesStore(store);

    expect(store.getState().customRhythm).toEqual(DEFAULT_PREFERENCES.customRhythm);
    expect(store.getState().durationOverrides).toEqual({ box: 12 });
    expect(store.getState().soundEnabled).toBe(false);
    expect(store.getState().beforeStartDismissed).toBe(true);
    expect(store.getState().localSessionLedger).toEqual([validLedger]);
  });

  it('resets only invalid overrides and invalid booleans independently', async () => {
    const invalidOverridesUser = 'bad-overrides';
    const invalidSoundUser = 'bad-sound';
    const memory = createMemoryStorage({
      [preferencesStorageKey(invalidOverridesUser)]: persistedPayload({
        customRhythm: { ...DEFAULT_PREFERENCES.customRhythm, durationMinutes: 3 },
        durationOverrides: { custom: 9 },
        soundEnabled: false,
        beforeStartDismissed: true,
        localSessionLedger: []
      }),
      [preferencesStorageKey(invalidSoundUser)]: persistedPayload({
        customRhythm: { ...DEFAULT_PREFERENCES.customRhythm, durationMinutes: 2 },
        durationOverrides: { coherent: 6 },
        soundEnabled: 'yes' as unknown as boolean,
        beforeStartDismissed: true,
        localSessionLedger: []
      })
    });

    const badOverrides = createUserPreferencesStore(invalidOverridesUser, memory.storage);
    await hydrateUserPreferencesStore(badOverrides);
    expect(badOverrides.getState().durationOverrides).toEqual({});
    expect(badOverrides.getState().customRhythm.durationMinutes).toBe(3);
    expect(badOverrides.getState().soundEnabled).toBe(false);
    expect(badOverrides.getState().beforeStartDismissed).toBe(true);

    const badSound = createUserPreferencesStore(invalidSoundUser, memory.storage);
    await hydrateUserPreferencesStore(badSound);
    expect(badSound.getState().soundEnabled).toBe(true);
    expect(badSound.getState().beforeStartDismissed).toBe(true);
    expect(badSound.getState().durationOverrides).toEqual({ coherent: 6 });
  });

  it('filters invalid hydrated ledger rows while retaining every valid row', async () => {
    const userId = 'filtered-ledger';
    const custom = customLedgerEntry();
    const pending = pendingLedgerEntry();
    const memory = createMemoryStorage({
      [preferencesStorageKey(userId)]: persistedPayload({
        customRhythm: { ...DEFAULT_PREFERENCES.customRhythm },
        durationOverrides: {},
        soundEnabled: true,
        beforeStartDismissed: false,
        localSessionLedger: [
          custom,
          { ...pending, methodType: 'custom' },
          pending,
          { clientSessionId: 'partial-row', state: 'pending' } as LocalSessionLedgerEntry
        ]
      })
    });
    const store = createUserPreferencesStore(userId, memory.storage);

    await hydrateUserPreferencesStore(store);

    expect(store.getState().localSessionLedger).toEqual([custom, pending]);
  });

  it('propagates storage reads that reject and never marks hydration successful', async () => {
    const readError = new Error('storage unavailable');
    const storage: StateStorage = {
      getItem: vi.fn().mockRejectedValue(readError),
      setItem: vi.fn(),
      removeItem: vi.fn()
    };
    const store = createUserPreferencesStore('read-failure', storage);

    await expect(hydrateUserPreferencesStore(store)).rejects.toBe(readError);
    expect(store.persist.hasHydrated()).toBe(false);
  });

  it('rejects a failed write, then retries the same ledger row with a fresh successful write', async () => {
    const values = new Map<string, string>();
    let attempts = 0;
    const storage: StateStorage = {
      async getItem(name) {
        return values.get(name) ?? null;
      },
      async setItem(name, value) {
        attempts += 1;
        if (attempts === 1) throw new Error('disk full');
        values.set(name, value);
      },
      async removeItem(name) {
        values.delete(name);
      }
    };
    const store = createUserPreferencesStore('write-retry', storage);
    const row = pendingLedgerEntry();

    await expect(store.getState().putLedgerEntry(row)).rejects.toThrow('disk full');
    expect(store.getState().localSessionLedger).toEqual([row]);

    await expect(store.getState().putLedgerEntry(row)).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(
      JSON.parse(values.get(preferencesStorageKey('write-retry'))!).state.localSessionLedger
    ).toEqual([row]);

    await expect(store.getState().setSoundEnabled(false)).resolves.toBeUndefined();
    expect(attempts).toBe(3);
  });
});
