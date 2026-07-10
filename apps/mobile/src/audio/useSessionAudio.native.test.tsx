import React from 'react';
import { jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react-native';

import type { CuePlayerPort, SessionCueKind } from './cuePlaybackController';

type MockPlayer = CuePlayerPort & {
  seekTo: jest.MockedFunction<CuePlayerPort['seekTo']>;
  play: jest.MockedFunction<CuePlayerPort['play']>;
};

const mockPlayerQueue: MockPlayer[] = [];
const mockUseAudioPlayer = jest.fn();

jest.mock(
  'expo-audio',
  () => ({
    useAudioPlayer: (...args: unknown[]) => mockUseAudioPlayer(...args)
  }),
  { virtual: true }
);

import {
  useSessionAudio,
  type UseSessionAudioOptions,
  type UseSessionAudioResult
} from './useSessionAudio';

const latest = new Map<string, UseSessionAudioResult>();

function player(overrides: Partial<CuePlayerPort> = {}): MockPlayer {
  return {
    seekTo: jest.fn(async () => undefined),
    play: jest.fn(),
    ...overrides
  } as MockPlayer;
}

function enqueuePlayers(
  overrides: Partial<Record<SessionCueKind, MockPlayer>> = {}
): Record<SessionCueKind, MockPlayer> {
  const players = {
    inhale: overrides.inhale ?? player(),
    hold: overrides.hold ?? player(),
    exhale: overrides.exhale ?? player(),
    complete: overrides.complete ?? player()
  };
  mockPlayerQueue.push(
    players.inhale,
    players.hold,
    players.exhale,
    players.complete
  );
  return players;
}

function HookProbe({ id, ...options }: UseSessionAudioOptions & { id: string }) {
  latest.set(id, useSessionAudio(options));
  return null;
}

describe('useSessionAudio', () => {
  beforeEach(() => {
    latest.clear();
    mockPlayerQueue.length = 0;
    mockUseAudioPlayer.mockReset();
    mockUseAudioPlayer.mockImplementation(() => {
      const ReactModule = jest.requireActual<typeof import('react')>('react');
      const playerRef = ReactModule.useRef<MockPlayer | null>(null);
      if (playerRef.current === null) {
        const nextPlayer = mockPlayerQueue.shift();
        if (!nextPlayer) {
          throw new Error('Missing queued audio player');
        }
        playerRef.current = nextPlayer;
      }
      return playerRef.current;
    });
  });

  it('creates four static players and persists preference toggles', async () => {
    enqueuePlayers();
    const setPreferenceEnabled = jest.fn(async () => undefined);
    const view = render(
      <HookProbe
        id="session"
        preferenceEnabled
        setPreferenceEnabled={setPreferenceEnabled}
      />
    );

    expect(mockUseAudioPlayer).toHaveBeenCalledTimes(4);
    for (const call of mockUseAudioPlayer.mock.calls) {
      expect(call).toHaveLength(1);
    }
    expect(latest.get('session')).toMatchObject({ enabled: true, note: null });

    await act(async () => latest.get('session')!.toggle());
    expect(setPreferenceEnabled).toHaveBeenCalledWith(false);

    view.rerender(
      <HookProbe
        id="session"
        preferenceEnabled={false}
        setPreferenceEnabled={setPreferenceEnabled}
      />
    );
    expect(latest.get('session')!.enabled).toBe(false);
    await act(async () => latest.get('session')!.toggle());
    expect(setPreferenceEnabled).toHaveBeenLastCalledWith(true);
  });

  it('plays each phase tuple once and completion once', async () => {
    const players = enqueuePlayers();
    const view = render(
      <HookProbe
        id="session"
        preferenceEnabled
        setPreferenceEnabled={jest.fn(async () => undefined)}
      />
    );

    await act(async () => {
      await latest.get('session')!.play('inhale', 0, 0);
      await latest.get('session')!.play('inhale', 0, 0);
      await latest.get('session')!.play('inhale', 1, 0);
      await latest.get('session')!.play('hold', 1, 0);
      await latest.get('session')!.play('complete', 1, 2);
      await latest.get('session')!.play('complete', 99, 99);
      await latest.get('session')!.play('exhale');
      await latest.get('session')!.play('exhale');
    });

    expect(players.inhale.seekTo).toHaveBeenCalledTimes(2);
    expect(players.inhale.play).toHaveBeenCalledTimes(2);
    expect(players.hold.seekTo).toHaveBeenCalledTimes(1);
    expect(players.complete.seekTo).toHaveBeenCalledTimes(1);
    expect(players.complete.play).toHaveBeenCalledTimes(1);
    expect(players.exhale.play).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it.each(['seek', 'play'] as const)(
    '%s failure disables only the current hook without changing the stored preference',
    async (failure) => {
      const failingPlayer =
        failure === 'seek'
          ? player({
              seekTo: jest.fn(async () => {
                throw new Error('cue not loaded');
              })
            })
          : player({
              play: jest.fn(() => {
                throw new Error('playback failed');
              })
            });
      enqueuePlayers({ inhale: failingPlayer });
      enqueuePlayers();
      const firstPreference = jest.fn(async () => undefined);
      const secondPreference = jest.fn(async () => undefined);
      render(
        <>
          <HookProbe
            id="first"
            preferenceEnabled
            setPreferenceEnabled={firstPreference}
          />
          <HookProbe
            id="second"
            preferenceEnabled
            setPreferenceEnabled={secondPreference}
          />
        </>
      );

      let callbackResult: void | undefined;
      await act(async () => {
        callbackResult = await latest.get('first')!.play('inhale', 0, 0);
      });

      expect(callbackResult).toBeUndefined();
      expect(failingPlayer.seekTo).toHaveBeenCalledWith(0);
      if (failure === 'play') {
        expect(failingPlayer.play).toHaveBeenCalledTimes(1);
      }
      await waitFor(() => expect(latest.get('first')!.enabled).toBe(false));
      expect(latest.get('first')!.note).toBeTruthy();
      expect(latest.get('second')).toMatchObject({ enabled: true, note: null });
      expect(firstPreference).not.toHaveBeenCalled();
      expect(secondPreference).not.toHaveBeenCalled();

      const note = latest.get('first')!.note;
      await act(async () => {
        callbackResult = await latest.get('first')!.play('hold', 0, 1);
      });
      expect(callbackResult).toBeUndefined();
      expect(latest.get('first')!.note).toBe(note);
    }
  );
});
