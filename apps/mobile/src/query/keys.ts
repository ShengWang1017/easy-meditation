export const publicQueryKeys = {
  methods: ['breathing-methods'] as const
};

export const authQueryKeys = {
  me: (revision: number) => ['auth-session', revision, 'me'] as const
};

export const userQueryKeys = {
  all: (userId: string) => ['user', userId] as const,
  stats: (userId: string) => ['user', userId, 'stats-summary'] as const,
  sessions: (userId: string, limit = 50) =>
    ['user', userId, 'practice-sessions', { limit }] as const
};
