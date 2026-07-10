import React from 'react';
import { jest } from '@jest/globals';
import { Text, Pressable } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { StateStorage } from 'zustand/middleware';

jest.mock(
  '@easy-meditation/shared',
  () => {
    const { z } = jest.requireActual<typeof import('zod')>('zod');
    const breathingPhaseSchema = z.object({
      kind: z.enum(['inhale', 'hold', 'exhale']),
      label: z.string().min(1),
      durationSeconds: z.number().int().min(1).max(60)
    });
    return {
      practiceSessionCreateSchema: z.object({
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
      })
    };
  },
  { virtual: true }
);

import {
  createUserPreferencesStore,
  hydrateUserPreferencesStore
} from './preferencesStore';
import {
  PreferencesStoreProvider,
  usePreferencesStore
} from './PreferencesStoreProvider';

function createMemoryStorage(): StateStorage {
  const values = new Map<string, string>();
  return {
    async getItem(name) {
      return values.get(name) ?? null;
    },
    async setItem(name, value) {
      values.set(name, value);
    },
    async removeItem(name) {
      values.delete(name);
    }
  };
}

function PreferencesProbe() {
  const soundEnabled = usePreferencesStore((state) => state.soundEnabled);
  const setSoundEnabled = usePreferencesStore((state) => state.setSoundEnabled);
  return (
    <>
      <Text testID="sound-state">{soundEnabled ? 'sound-on' : 'sound-off'}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void setSoundEnabled(!soundEnabled)}
        testID="toggle-sound"
      >
        <Text>toggle</Text>
      </Pressable>
    </>
  );
}

describe('PreferencesStoreProvider', () => {
  it('accepts an already hydrated store and selector subscriptions update', async () => {
    const store = createUserPreferencesStore('provider-user', createMemoryStorage());
    await hydrateUserPreferencesStore(store);
    const view = render(
      <PreferencesStoreProvider store={store}>
        <PreferencesProbe />
      </PreferencesStoreProvider>
    );

    expect(store.persist.hasHydrated()).toBe(true);
    expect(view.getByTestId('sound-state').props.children).toBe('sound-on');

    fireEvent.press(view.getByTestId('toggle-sound'));
    await waitFor(() => {
      expect(view.getByTestId('sound-state').props.children).toBe('sound-off');
    });
  });

  it('isolates stores and drops the replaced account subscription', async () => {
    const first = createUserPreferencesStore('account-a', createMemoryStorage());
    const second = createUserPreferencesStore('account-b', createMemoryStorage());
    await hydrateUserPreferencesStore(first);
    await hydrateUserPreferencesStore(second);
    await second.getState().setSoundEnabled(false);

    const view = render(
      <PreferencesStoreProvider store={first}>
        <PreferencesProbe />
      </PreferencesStoreProvider>
    );
    expect(view.getByTestId('sound-state').props.children).toBe('sound-on');

    view.rerender(
      <PreferencesStoreProvider store={second}>
        <PreferencesProbe />
      </PreferencesStoreProvider>
    );
    expect(view.getByTestId('sound-state').props.children).toBe('sound-off');

    await act(async () => {
      await first.getState().setSoundEnabled(false);
      await first.getState().setSoundEnabled(true);
    });
    expect(view.getByTestId('sound-state').props.children).toBe('sound-off');

    view.unmount();
    await act(async () => {
      await second.getState().setSoundEnabled(true);
    });
  });

  it('throws a clear error when the selector hook is used outside its provider', () => {
    expect(() => render(<PreferencesProbe />)).toThrow(
      'usePreferencesStore must be used within PreferencesStoreProvider'
    );
  });
});
