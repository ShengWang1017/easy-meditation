import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { createStore, type Mutate, type StoreApi } from 'zustand/vanilla';
import {
  createJSONStorage,
  persist,
  type StateStorage
} from 'zustand/middleware';

import {
  DEFAULT_CUSTOM_RHYTHM,
  redistributeCycleSeconds,
  type CustomDurationMinutes,
  type CustomRhythm
} from '../domain/customRhythm';
import type { LocalSessionLedgerEntry } from '../domain/sessionLedger';
import {
  beforeStartDismissedSchema,
  builtInMethodIdSchema,
  customDurationMinutesSchema,
  customRhythmPreferencesSchema,
  durationOverridesSchema,
  localSessionLedgerEntrySchema,
  soundEnabledSchema,
  type BuiltInMethodId,
  type DurationOverrides
} from './preferencesSchema';

export const DEFAULT_PREFERENCES = {
  customRhythm: {
    name: '自定义',
    inhaleSeconds: 4,
    holdSeconds: 2,
    exhaleSeconds: 5,
    durationMinutes: 5
  },
  durationOverrides: {},
  soundEnabled: true,
  beforeStartDismissed: false,
  localSessionLedger: []
} as const;

type CustomPhase = 'inhaleSeconds' | 'holdSeconds' | 'exhaleSeconds';

export type LedgerEntryUpdater = (
  current: LocalSessionLedgerEntry
) => LocalSessionLedgerEntry;

export type UserPreferencesState = {
  customRhythm: CustomRhythm;
  durationOverrides: DurationOverrides;
  soundEnabled: boolean;
  beforeStartDismissed: boolean;
  localSessionLedger: LocalSessionLedgerEntry[];
  setCustomPhase(phase: CustomPhase, seconds: number): Promise<void>;
  setCustomCycleSeconds(seconds: number): Promise<void>;
  setCustomDuration(durationMinutes: CustomDurationMinutes): Promise<void>;
  setDurationOverride(
    methodId: BuiltInMethodId | 'custom',
    durationMinutes: number
  ): Promise<void>;
  setSoundEnabled(enabled: boolean): Promise<void>;
  dismissBeforeStart(): Promise<void>;
  putLedgerEntry(entry: LocalSessionLedgerEntry): Promise<void>;
  updateLedgerEntry(
    clientSessionId: string,
    updater: LedgerEntryUpdater
  ): Promise<void>;
  removeLedgerEntry(clientSessionId: string): Promise<void>;
};

type PersistedPreferences = Pick<
  UserPreferencesState,
  | 'customRhythm'
  | 'durationOverrides'
  | 'soundEnabled'
  | 'beforeStartDismissed'
  | 'localSessionLedger'
>;

export type UserPreferencesStore = Mutate<
  StoreApi<UserPreferencesState>,
  [['zustand/persist', PersistedPreferences]]
>;

type HydrationStatus = {
  getError(): unknown;
};

const hydrationStatuses = new WeakMap<UserPreferencesStore, HydrationStatus>();
const customPhaseSchema = z.enum(['inhaleSeconds', 'holdSeconds', 'exhaleSeconds']);
const phaseSecondsSchema = z.number().int().min(1).max(12);
const cycleSecondsSchema = z.number().int().min(3).max(36);
const clientSessionIdSchema = z.string().uuid();

function cloneLedgerEntry(entry: LocalSessionLedgerEntry): LocalSessionLedgerEntry {
  return {
    ...entry,
    rhythmSnapshot: entry.rhythmSnapshot.map((phase) => ({ ...phase }))
  };
}

function cloneDefaultPreferences(): PersistedPreferences {
  return {
    customRhythm: { ...DEFAULT_CUSTOM_RHYTHM },
    durationOverrides: {},
    soundEnabled: DEFAULT_PREFERENCES.soundEnabled,
    beforeStartDismissed: DEFAULT_PREFERENCES.beforeStartDismissed,
    localSessionLedger: []
  };
}

function recoverPersistedPreferences(value: unknown): PersistedPreferences {
  const defaults = cloneDefaultPreferences();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return defaults;
  }

  const persisted = value as Record<string, unknown>;
  const customRhythm = customRhythmPreferencesSchema.safeParse(persisted.customRhythm);
  const durationOverrides = durationOverridesSchema.safeParse(persisted.durationOverrides);
  const soundEnabled = soundEnabledSchema.safeParse(persisted.soundEnabled);
  const beforeStartDismissed = beforeStartDismissedSchema.safeParse(
    persisted.beforeStartDismissed
  );
  const ledgerValues = Array.isArray(persisted.localSessionLedger)
    ? persisted.localSessionLedger
    : [];
  const localSessionLedger = ledgerValues.flatMap((entry) => {
    const result = localSessionLedgerEntrySchema.safeParse(entry);
    return result.success ? [cloneLedgerEntry(result.data)] : [];
  });

  return {
    customRhythm: customRhythm.success
      ? { ...customRhythm.data }
      : defaults.customRhythm,
    durationOverrides: durationOverrides.success
      ? { ...durationOverrides.data }
      : defaults.durationOverrides,
    soundEnabled: soundEnabled.success ? soundEnabled.data : defaults.soundEnabled,
    beforeStartDismissed: beforeStartDismissed.success
      ? beforeStartDismissed.data
      : defaults.beforeStartDismissed,
    localSessionLedger
  };
}

function createAwaitableStateStorage(base: StateStorage) {
  let tail: Promise<void> = Promise.resolve();
  let latest: Promise<void> = tail;
  const storage: StateStorage = {
    getItem: (name) => base.getItem(name),
    setItem(name, value) {
      latest = tail
        .catch(() => undefined)
        .then(() => base.setItem(name, value))
        .then(() => undefined);
      tail = latest;
      return latest;
    },
    removeItem(name) {
      latest = tail
        .catch(() => undefined)
        .then(() => base.removeItem(name))
        .then(() => undefined);
      tail = latest;
      return latest;
    }
  };

  return { storage, flush: () => latest };
}

export function preferencesStorageKey(
  userId: string
): `easyMeditation.preferences.${string}` {
  return `easyMeditation.preferences.${userId}`;
}

export function createUserPreferencesStore(
  userId: string,
  storage: StateStorage = AsyncStorage
): UserPreferencesStore {
  const defaults = cloneDefaultPreferences();
  const barrier = createAwaitableStateStorage(storage);
  let hydrationError: unknown;

  const store = createStore<UserPreferencesState>()(
    persist<UserPreferencesState, [], [], PersistedPreferences>(
      (set, get) => ({
        ...defaults,
        async setCustomPhase(phase, seconds) {
          const validPhase = customPhaseSchema.parse(phase);
          const validSeconds = phaseSecondsSchema.parse(seconds);
          set((state) => ({
            customRhythm: {
              ...state.customRhythm,
              [validPhase]: validSeconds
            }
          }));
          await barrier.flush();
        },
        async setCustomCycleSeconds(seconds) {
          const validSeconds = cycleSecondsSchema.parse(seconds);
          set((state) => ({
            customRhythm: {
              ...state.customRhythm,
              ...redistributeCycleSeconds(state.customRhythm, validSeconds)
            }
          }));
          await barrier.flush();
        },
        async setCustomDuration(durationMinutes) {
          const validDuration = customDurationMinutesSchema.parse(durationMinutes);
          set((state) => ({
            customRhythm: {
              ...state.customRhythm,
              durationMinutes: validDuration
            }
          }));
          await barrier.flush();
        },
        async setDurationOverride(methodId, durationMinutes) {
          const validMethodId = builtInMethodIdSchema.parse(methodId);
          const validOverrides = durationOverridesSchema.parse({
            ...get().durationOverrides,
            [validMethodId]: durationMinutes
          });
          set({ durationOverrides: validOverrides });
          await barrier.flush();
        },
        async setSoundEnabled(enabled) {
          const validEnabled = soundEnabledSchema.parse(enabled);
          set({ soundEnabled: validEnabled });
          await barrier.flush();
        },
        async dismissBeforeStart() {
          const previousDismissed = get().beforeStartDismissed;
          set({ beforeStartDismissed: true });
          try {
            await barrier.flush();
          } catch (error) {
            set({ beforeStartDismissed: previousDismissed });
            try {
              await barrier.flush();
            } catch {
              // The failed dismissal did not replace the previously persisted value.
            }
            throw error;
          }
        },
        async putLedgerEntry(entry) {
          const validEntry = cloneLedgerEntry(localSessionLedgerEntrySchema.parse(entry));
          set((state) => {
            const existingIndex = state.localSessionLedger.findIndex(
              (candidate) => candidate.clientSessionId === validEntry.clientSessionId
            );
            if (existingIndex === -1) {
              return {
                localSessionLedger: [...state.localSessionLedger, validEntry]
              };
            }

            const localSessionLedger = [...state.localSessionLedger];
            localSessionLedger[existingIndex] = validEntry;
            return { localSessionLedger };
          });
          await barrier.flush();
        },
        async updateLedgerEntry(clientSessionId, updater) {
          const validClientSessionId = clientSessionIdSchema.parse(clientSessionId);
          const current = get().localSessionLedger.find(
            (entry) => entry.clientSessionId === validClientSessionId
          );
          if (!current) {
            throw new Error(`Ledger entry not found: ${validClientSessionId}`);
          }

          const updated = localSessionLedgerEntrySchema.parse(
            updater(cloneLedgerEntry(current))
          );
          if (updated.clientSessionId !== validClientSessionId) {
            throw new Error('A ledger update cannot change clientSessionId.');
          }

          const clonedUpdate = cloneLedgerEntry(updated);
          set((state) => ({
            localSessionLedger: state.localSessionLedger.map((entry) =>
              entry.clientSessionId === validClientSessionId ? clonedUpdate : entry
            )
          }));
          await barrier.flush();
        },
        async removeLedgerEntry(clientSessionId) {
          const validClientSessionId = clientSessionIdSchema.parse(clientSessionId);
          set((state) => ({
            localSessionLedger: state.localSessionLedger.filter(
              (entry) => entry.clientSessionId !== validClientSessionId
            )
          }));
          await barrier.flush();
        }
      }),
      {
        name: preferencesStorageKey(userId),
        storage: createJSONStorage(() => barrier.storage),
        skipHydration: true,
        partialize: (state) => ({
          customRhythm: state.customRhythm,
          durationOverrides: state.durationOverrides,
          soundEnabled: state.soundEnabled,
          beforeStartDismissed: state.beforeStartDismissed,
          localSessionLedger: state.localSessionLedger
        }),
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...recoverPersistedPreferences(persistedState)
        }),
        onRehydrateStorage: () => {
          hydrationError = undefined;
          return (_state, error) => {
            hydrationError = error;
          };
        }
      }
    )
  );

  hydrationStatuses.set(store, { getError: () => hydrationError });
  return store;
}

export async function hydrateUserPreferencesStore(
  store: UserPreferencesStore
): Promise<void> {
  await store.persist.rehydrate();
  const error = hydrationStatuses.get(store)?.getError();
  if (error !== undefined) throw error;
  if (!store.persist.hasHydrated()) {
    throw new Error('User preferences store did not finish hydration.');
  }
}
