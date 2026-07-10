import type { PracticeSessionCreateInput } from '@easy-meditation/shared';

export type LocalSessionLedgerEntry =
  | (PracticeSessionCreateInput & {
      origin: 'custom';
      state: 'local-only';
    })
  | (PracticeSessionCreateInput & {
      origin: 'built_in';
      state: 'pending' | 'retry-paused';
      attemptCount: number;
      nextAttemptAt: string | null;
      lastErrorCode: string | null;
    })
  | (PracticeSessionCreateInput & {
      origin: 'built_in';
      state: 'failed-terminal';
      lastErrorCode: string;
    });
