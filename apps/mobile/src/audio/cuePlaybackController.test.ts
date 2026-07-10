import { describe, expect, it, vi } from 'vitest';

import {
  createCuePlaybackController,
  type CuePlayerPort,
  type SessionCueKind
} from './cuePlaybackController';

function player() {
  const events: string[] = [];
  const port: CuePlayerPort = {
    seekTo: vi.fn(async (seconds: number) => {
      events.push(`seek:${seconds}`);
    }),
    play: vi.fn(() => {
      events.push('play');
    })
  };

  return { events, port };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('createCuePlaybackController', () => {
  it('seeks to the beginning before every play', async () => {
    const kinds: SessionCueKind[] = ['inhale', 'hold', 'exhale', 'complete'];
    const players = Object.fromEntries(kinds.map((kind) => [kind, player()])) as Record<
      SessionCueKind,
      ReturnType<typeof player>
    >;
    const controller = createCuePlaybackController(
      Object.fromEntries(kinds.map((kind) => [kind, players[kind].port])) as Record<
        SessionCueKind,
        CuePlayerPort
      >
    );

    for (const kind of kinds) {
      await expect(controller.play(kind)).resolves.toBe(true);
      await expect(controller.play(kind)).resolves.toBe(true);
      expect(players[kind].events).toEqual([
        'seek:0',
        'play',
        'seek:0',
        'play'
      ]);
    }
  });

  it('returns false when seeking or playing fails', async () => {
    const seekFailure: CuePlayerPort = {
      seekTo: vi.fn(async () => {
        throw new Error('not loaded');
      }),
      play: vi.fn()
    };
    const playFailure: CuePlayerPort = {
      seekTo: vi.fn(async () => undefined),
      play: vi.fn(() => {
        throw new Error('play failed');
      })
    };
    const healthy = player().port;
    const controller = createCuePlaybackController({
      inhale: seekFailure,
      hold: playFailure,
      exhale: healthy,
      complete: healthy
    });

    await expect(controller.play('inhale')).resolves.toBe(false);
    expect(seekFailure.play).not.toHaveBeenCalled();
    await expect(controller.play('hold')).resolves.toBe(false);
  });

  it('checks the run guard after seeking and before starting playback', async () => {
    const seek = deferred<void>();
    const inhale: CuePlayerPort = {
      seekTo: vi.fn(() => seek.promise),
      play: vi.fn()
    };
    const healthy = player().port;
    const controller = createCuePlaybackController({
      inhale,
      hold: healthy,
      exhale: healthy,
      complete: healthy
    });
    let currentRun = true;
    const guard = vi.fn(() => currentRun);

    const playback = controller.play('inhale', guard);
    currentRun = false;
    seek.resolve();

    await expect(playback).resolves.toBe(false);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(inhale.play).not.toHaveBeenCalled();
  });
});
