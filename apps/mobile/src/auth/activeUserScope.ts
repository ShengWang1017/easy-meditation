import type { QueryClient } from '@tanstack/react-query';

import { retireUserScope } from './sessionScope';

export type ActiveUserScopeCoordinator = {
  getUserId(): string | null;
  activate(userId: string): Promise<void>;
  retire(): Promise<void>;
};

export function createActiveUserScopeCoordinator(
  queryClient: QueryClient
): ActiveUserScopeCoordinator {
  let activeUserId: string | null = null;
  let tail: Promise<void> = Promise.resolve();

  function enqueue(operation: () => Promise<void>): Promise<void> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  }

  async function retireCurrent(): Promise<void> {
    const retiringUserId = activeUserId;
    if (retiringUserId === null) {
      return;
    }

    await retireUserScope(queryClient, retiringUserId);
    if (activeUserId === retiringUserId) {
      activeUserId = null;
    }
  }

  return {
    getUserId: () => activeUserId,
    activate(userId) {
      return enqueue(async () => {
        if (activeUserId === userId) {
          return;
        }
        await retireCurrent();
        activeUserId = userId;
      });
    },
    retire() {
      return enqueue(retireCurrent);
    }
  };
}
