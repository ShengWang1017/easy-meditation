import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { publicQueryKeys, userQueryKeys } from '../query/keys';
import { retireUserScope } from './sessionScope';

describe('retireUserScope', () => {
  it('awaits cancellation before removing only the retiring user prefix', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(userQueryKeys.stats('A'), { total: 1 });
    queryClient.setQueryData(userQueryKeys.stats('B'), { total: 2 });
    queryClient.setQueryData(publicQueryKeys.methods, [{ id: 'method' }]);

    let releaseCancellation!: () => void;
    const cancellation = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    const cancelSpy = vi
      .spyOn(queryClient, 'cancelQueries')
      .mockReturnValue(cancellation);
    const removeSpy = vi.spyOn(queryClient, 'removeQueries');

    const retirement = retireUserScope(queryClient, 'A');

    await Promise.resolve();
    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: userQueryKeys.all('A') });
    expect(removeSpy).not.toHaveBeenCalled();

    releaseCancellation();
    await retirement;

    expect(removeSpy).toHaveBeenCalledWith({ queryKey: userQueryKeys.all('A') });
    expect(queryClient.getQueryData(userQueryKeys.stats('A'))).toBeUndefined();
    expect(queryClient.getQueryData(userQueryKeys.stats('B'))).toEqual({ total: 2 });
    expect(queryClient.getQueryData(publicQueryKeys.methods)).toEqual([{ id: 'method' }]);
  });
});
