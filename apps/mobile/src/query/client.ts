import { QueryClient } from '@tanstack/react-query';

import { createActiveUserScopeCoordinator } from '../auth/activeUserScope';

export const appQueryClient = new QueryClient();
export const activeUserScopeCoordinator =
  createActiveUserScopeCoordinator(appQueryClient);
