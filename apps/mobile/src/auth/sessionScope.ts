import type { QueryClient } from '@tanstack/react-query';
import type { Me } from '@easy-meditation/shared';

import { userQueryKeys } from '../query/keys';
import type { SessionOutbox } from '../services/sessionOutbox';
import type { UserPreferencesStore } from '../store/preferencesStore';

export type AuthSessionContextValue = {
  user: Me;
  userId: string;
  preferencesStore: UserPreferencesStore;
  sessionOutbox: SessionOutbox;
};

export async function retireUserScope(
  queryClient: QueryClient,
  userId: string
): Promise<void> {
  const queryKey = userQueryKeys.all(userId);
  await queryClient.cancelQueries({ queryKey });
  queryClient.removeQueries({ queryKey });
}
