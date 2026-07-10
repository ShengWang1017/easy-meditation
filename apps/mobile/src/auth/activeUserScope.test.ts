import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { createActiveUserScopeCoordinator } from './activeUserScope';
import * as sessionScope from './sessionScope';

describe('createActiveUserScopeCoordinator', () => {
  it('keeps the active user at root lifetime until explicitly retired', async () => {
    const retireSpy = vi.spyOn(sessionScope, 'retireUserScope');
    const coordinator = createActiveUserScopeCoordinator(new QueryClient());
    const protectedChild = {
      mount: () => coordinator.activate('A'),
      unmount: vi.fn()
    };

    await protectedChild.mount();
    protectedChild.unmount();

    expect(coordinator.getUserId()).toBe('A');
    expect(retireSpy).not.toHaveBeenCalled();

    await protectedChild.mount();

    expect(coordinator.getUserId()).toBe('A');
    expect(retireSpy).not.toHaveBeenCalled();
  });

  it('treats activating the current user as a no-op', async () => {
    const retireSpy = vi.spyOn(sessionScope, 'retireUserScope');
    const coordinator = createActiveUserScopeCoordinator(new QueryClient());

    await coordinator.activate('A');
    await coordinator.activate('A');

    expect(retireSpy).not.toHaveBeenCalled();
    expect(coordinator.getUserId()).toBe('A');
  });

  it('serializes overlapping activation and retirement operations', async () => {
    const events: string[] = [];
    let releaseA!: () => void;
    const aRetirement = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    vi.spyOn(sessionScope, 'retireUserScope').mockImplementation(async (_client, userId) => {
      events.push(`retire:${userId}:start`);
      if (userId === 'A') {
        await aRetirement;
      }
      events.push(`retire:${userId}:end`);
    });
    const coordinator = createActiveUserScopeCoordinator(new QueryClient());
    await coordinator.activate('A');

    const activateB = coordinator.activate('B');
    const retireB = coordinator.retire();

    await Promise.resolve();
    expect(events).toEqual(['retire:A:start']);
    expect(coordinator.getUserId()).toBe('A');

    releaseA();
    await Promise.all([activateB, retireB]);

    expect(events).toEqual([
      'retire:A:start',
      'retire:A:end',
      'retire:B:start',
      'retire:B:end'
    ]);
    expect(coordinator.getUserId()).toBeNull();
  });
});
