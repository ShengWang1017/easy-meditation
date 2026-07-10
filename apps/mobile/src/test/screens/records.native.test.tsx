import React from 'react';
import { jest } from '@jest/globals';
import type {
  PracticeSession,
  PracticeSessionCreateInput,
  StatsSummary
} from '@easy-meditation/shared';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

const mockDrainDue = jest.fn(async (): Promise<void> => undefined);
const mockRetryNow = jest.fn(async (_clientSessionId: string): Promise<void> => undefined);
let mockAuthSession = {
  userId: 'user-a',
  sessionOutbox: {
    drainDue: mockDrainDue,
    retryNow: mockRetryNow,
    submit: jest.fn(async (): Promise<void> => undefined)
  }
};

jest.mock(
  '@easy-meditation/shared',
  () => {
    const { z } = jest.requireActual<typeof import('zod')>('zod');
    const phaseSchema = z.object({
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
        rhythmSnapshot: z.array(phaseSchema).min(1),
        plannedDurationSeconds: z.number().int().min(1).max(24 * 60 * 60),
        actualDurationSeconds: z.number().int().min(1).max(24 * 60 * 60),
        completed: z.boolean(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime()
      }),
      secondsToTimerLabel: (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const remainder = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
      }
    };
  },
  { virtual: true }
);

jest.mock('../../auth/AuthSessionBoundary', () => ({
  useAuthSession: () => mockAuthSession
}));
jest.mock('../../api/stats', () => ({ fetchStatsSummary: jest.fn() }));
jest.mock('../../api/sessions', () => ({ fetchPracticeSessions: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 })
}));

import RecordsScreen from '../../../app/(tabs)/records';
import { fetchPracticeSessions } from '../../api/sessions';
import { fetchStatsSummary } from '../../api/stats';
import { PrototypeScreen } from '../../components/PrototypeScreen';
import type { LocalSessionLedgerEntry } from '../../domain/sessionLedger';
import { userQueryKeys } from '../../query/keys';
import { PreferencesStoreProvider } from '../../store/PreferencesStoreProvider';
import {
  createUserPreferencesStore,
  hydrateUserPreferencesStore,
  type UserPreferencesStore
} from '../../store/preferencesStore';
import {
  createTestQueryClient,
  renderWithProviders
} from '../renderWithProviders';

const fetchStatsMock = fetchStatsSummary as jest.MockedFunction<typeof fetchStatsSummary>;
const fetchSessionsMock = fetchPracticeSessions as jest.MockedFunction<
  typeof fetchPracticeSessions
>;
const rhythmSnapshot = [
  { kind: 'inhale' as const, label: '吸气', durationSeconds: 4 },
  { kind: 'exhale' as const, label: '呼气', durationSeconds: 4 }
];

function uuid(prefix: number, index: number): string {
  return `${prefix.toString().padStart(8, '0')}-0000-4000-8000-${index
    .toString()
    .padStart(12, '0')}`;
}

function sessionInput(
  index: number,
  options: Partial<PracticeSessionCreateInput> = {}
): PracticeSessionCreateInput {
  return {
    clientSessionId: uuid(1, index),
    methodType: 'built_in',
    methodId: 'box',
    customRhythmId: null,
    methodTitleSnapshot: `练习 ${index}`,
    rhythmSnapshot,
    plannedDurationSeconds: 300,
    actualDurationSeconds: 120,
    completed: true,
    startedAt: `2026-07-${String(index).padStart(2, '0')}T10:00:00.000Z`,
    endedAt: `2026-07-${String(index).padStart(2, '0')}T10:02:00.000Z`,
    ...options
  };
}

function serverSession(
  index: number,
  options: Partial<PracticeSession> = {}
): PracticeSession {
  return {
    ...sessionInput(index),
    id: uuid(2, index),
    createdAt: '2026-07-10T10:03:00.000Z',
    ...options
  };
}

function ledgerEntry(
  index: number,
  state: LocalSessionLedgerEntry['state'],
  options: Partial<PracticeSessionCreateInput> = {}
): LocalSessionLedgerEntry {
  const record = sessionInput(index, options);
  if (state === 'local-only') {
    return {
      ...record,
      methodType: 'custom',
      methodId: null,
      origin: 'custom',
      state
    };
  }
  if (state === 'failed-terminal') {
    return {
      ...record,
      origin: 'built_in',
      state,
      lastErrorCode: 'INVALID_SESSION'
    };
  }
  return {
    ...record,
    origin: 'built_in',
    state,
    attemptCount: state === 'retry-paused' ? 5 : 0,
    nextAttemptAt: null,
    lastErrorCode: state === 'retry-paused' ? 'NETWORK_ERROR' : null
  };
}

function statsSummary(options: Partial<StatsSummary> = {}): StatsSummary {
  return {
    totalSessions: 0,
    totalPracticeSeconds: 0,
    weeklyPracticeSeconds: 0,
    currentStreak: 0,
    recentSessions: [],
    ...options
  };
}

function memoryStorage(): StateStorage {
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

async function preferencesStore(
  userId: string,
  ledger: LocalSessionLedgerEntry[] = []
): Promise<UserPreferencesStore> {
  const store = createUserPreferencesStore(userId, memoryStorage());
  await hydrateUserPreferencesStore(store);
  for (const entry of ledger) {
    await store.getState().putLedgerEntry(entry);
  }
  return store;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function renderRecords(store: UserPreferencesStore, queryClient = createTestQueryClient()) {
  const view = renderWithProviders(
    <PreferencesStoreProvider store={store}>
      <RecordsScreen />
    </PreferencesStoreProvider>,
    { queryClient }
  );
  return { ...view, store };
}

describe('RecordsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDrainDue.mockResolvedValue(undefined);
    mockRetryNow.mockResolvedValue(undefined);
    mockAuthSession = {
      userId: 'user-a',
      sessionOutbox: {
        drainDue: mockDrainDue,
        retryNow: mockRetryNow,
        submit: jest.fn(async (): Promise<void> => undefined)
      }
    };
    fetchStatsMock.mockResolvedValue(statsSummary());
    fetchSessionsMock.mockResolvedValue([]);
  });

  it('shows full loading only when neither server source nor local ledger has data', async () => {
    const stats = deferred<StatsSummary>();
    const sessions = deferred<PracticeSession[]>();
    fetchStatsMock.mockReturnValue(stats.promise);
    fetchSessionsMock.mockReturnValue(sessions.promise);
    const store = await preferencesStore('user-a');
    const view = renderRecords(store);

    expect(view.getByText('正在加载练习记录…')).toBeTruthy();

    await act(async () => {
      stats.resolve(statsSummary());
      sessions.resolve([]);
      await Promise.all([stats.promise, sessions.promise]);
    });
    await waitFor(() =>
      expect(view.getByText('完成一次练习后会出现在这里')).toBeTruthy()
    );
  });

  it('uses exact user query keys and matches the populated Web hierarchy and copy', async () => {
    const completed = serverSession(10, {
      methodTitleSnapshot: '盒式呼吸法',
      actualDurationSeconds: 125,
      endedAt: '2026-07-10T10:02:00.000Z'
    });
    fetchStatsMock.mockResolvedValue(
      statsSummary({
        totalSessions: 3,
        totalPracticeSeconds: 300,
        weeklyPracticeSeconds: 180,
        recentSessions: [completed]
      })
    );
    fetchSessionsMock.mockResolvedValue([completed]);
    const store = await preferencesStore('user-a');
    const view = renderRecords(store);

    await waitFor(() => expect(view.getByText('轻轻记住坚持')).toBeTruthy());
    expect(view.UNSAFE_getByType(PrototypeScreen).props).toMatchObject({
      backgroundVariant: 'records',
      scrollable: true
    });
    expect(view.getByText('练习记录')).toBeTruthy();
    expect(view.getByTestId('records-total').children).toContain('5 分钟');
    expect(view.getByText('连续天数')).toBeTruthy();
    expect(view.getByText('本周时长')).toBeTruthy();
    expect(view.getByText('完成次数')).toBeTruthy();
    expect(view.getByText('热力日历')).toBeTruthy();
    expect(view.getByText('盒式呼吸法')).toBeTruthy();
    expect(view.getByText('7月10日')).toBeTruthy();
    expect(view.getByText('2 分 5 秒')).toBeTruthy();
    expect(view.queryByTestId('bottom-pill-nav')).toBeNull();
    expect(StyleSheet.flatten(view.getByTestId('records-screen-content').props.style))
      .toMatchObject({ gap: 11, paddingBottom: 88, paddingTop: 4 });
    expect(StyleSheet.flatten(view.getByTestId('records-hero').props.style))
      .toMatchObject({
        borderRadius: 24,
        minHeight: 82,
        paddingBottom: 13,
        paddingHorizontal: 16,
        paddingTop: 14
      });
    expect(StyleSheet.flatten(view.getByTestId('records-stats').props.style))
      .toMatchObject({ flexDirection: 'row', gap: 8 });
    expect(
      StyleSheet.flatten(
        view.getByTestId(`record-row-${completed.id}`).props.style
      )
    ).toMatchObject({
      borderRadius: 19,
      minHeight: 58,
      paddingHorizontal: 10,
      paddingVertical: 9
    });
    expect(
      view.queryClient.getQueryCache().find({
        queryKey: userQueryKeys.stats('user-a'),
        exact: true
      })
    ).toBeDefined();
    expect(
      view.queryClient.getQueryCache().find({
        queryKey: userQueryKeys.sessions('user-a'),
        exact: true
      })
    ).toBeDefined();
  });

  it('renders the exact empty copy after both sources load', async () => {
    const store = await preferencesStore('user-a');
    const view = renderRecords(store);

    await waitFor(() =>
      expect(view.getByText('完成一次练习后会出现在这里')).toBeTruthy()
    );
    expect(view.queryByText('还没有练习记录')).toBeNull();
  });

  it('does not block local records on a never-settling outbox drain or server queries', async () => {
    const stats = deferred<StatsSummary>();
    const sessions = deferred<PracticeSession[]>();
    const drain = deferred<void>();
    fetchStatsMock.mockReturnValue(stats.promise);
    fetchSessionsMock.mockReturnValue(sessions.promise);
    mockDrainDue.mockReturnValue(drain.promise);
    const local = ledgerEntry(10, 'local-only', {
      methodTitleSnapshot: '本机自定义练习'
    });
    const store = await preferencesStore('user-a', [local]);
    const view = renderRecords(store);

    await waitFor(() => expect(view.getByText('本机自定义练习')).toBeTruthy());
    expect(view.queryByText('正在加载练习记录…')).toBeNull();
    expect(mockDrainDue).toHaveBeenCalledTimes(1);
  });

  it('drains once per scoped outbox across ledger rerenders and catches rejection', async () => {
    mockDrainDue.mockRejectedValue(new Error('offline'));
    const first = ledgerEntry(9, 'local-only', { methodTitleSnapshot: '第一条' });
    const second = ledgerEntry(10, 'pending', { methodTitleSnapshot: '第二条' });
    const store = await preferencesStore('user-a', [first]);
    const view = renderRecords(store);

    await waitFor(() => expect(view.getByText('第一条')).toBeTruthy());
    await act(async () => store.getState().putLedgerEntry(second));
    await waitFor(() => expect(view.getByText('第二条')).toBeTruthy());
    expect(mockDrainDue).toHaveBeenCalledTimes(1);
  });

  it('shows a full error only with no server or local data and retries both queries', async () => {
    fetchStatsMock
      .mockRejectedValueOnce(new Error('stats offline'))
      .mockResolvedValueOnce(statsSummary());
    fetchSessionsMock
      .mockRejectedValueOnce(new Error('sessions offline'))
      .mockResolvedValueOnce([]);
    const store = await preferencesStore('user-a');
    const view = renderRecords(store);

    await waitFor(() => expect(view.getByText('暂时无法加载记录')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: '重新加载' }));
    await waitFor(() => expect(fetchStatsMock).toHaveBeenCalledTimes(2));
    expect(fetchSessionsMock).toHaveBeenCalledTimes(2);
    expect(mockDrainDue).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(view.getByText('完成一次练习后会出现在这里')).toBeTruthy()
    );
  });

  it('shows accessible busy progress while a full-error retry is pending', async () => {
    const retryStats = deferred<StatsSummary>();
    const retrySessions = deferred<PracticeSession[]>();
    fetchStatsMock
      .mockRejectedValueOnce(new Error('stats offline'))
      .mockReturnValueOnce(retryStats.promise);
    fetchSessionsMock
      .mockRejectedValueOnce(new Error('sessions offline'))
      .mockReturnValueOnce(retrySessions.promise);
    const store = await preferencesStore('user-a');
    const view = renderRecords(store);

    await waitFor(() => expect(view.getByText('暂时无法加载记录')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: '重新加载' }));

    await waitFor(() => expect(fetchStatsMock).toHaveBeenCalledTimes(2));
    expect(fetchSessionsMock).toHaveBeenCalledTimes(2);
    expect(view.getByRole('progressbar').props.accessibilityState).toMatchObject({
      busy: true
    });
    expect(view.getByText('正在重新加载练习记录…')).toBeTruthy();
    expect(view.queryByRole('button', { name: '重新加载' })).toBeNull();

    await act(async () => {
      retryStats.resolve(statsSummary());
      retrySessions.resolve([]);
      await Promise.all([retryStats.promise, retrySessions.promise]);
    });
    await waitFor(() =>
      expect(view.getByText('完成一次练习后会出现在这里')).toBeTruthy()
    );
  });

  it('keeps cached records visible on refresh errors and retries both exact queries', async () => {
    const cached = serverSession(10, { methodTitleSnapshot: '缓存练习' });
    fetchStatsMock.mockRejectedValue(new Error('stats offline'));
    fetchSessionsMock.mockRejectedValue(new Error('sessions offline'));
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      userQueryKeys.stats('user-a'),
      statsSummary({
        totalSessions: 1,
        totalPracticeSeconds: 120,
        weeklyPracticeSeconds: 120,
        recentSessions: [cached]
      })
    );
    queryClient.setQueryData(userQueryKeys.sessions('user-a'), [cached]);
    const store = await preferencesStore('user-a');
    const view = renderRecords(store, queryClient);

    await waitFor(() => expect(view.getByText('记录更新失败')).toBeTruthy());
    expect(view.getByText('缓存练习')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: '重试服务器记录' }));
    await waitFor(() => expect(fetchStatsMock).toHaveBeenCalledTimes(2));
    expect(fetchSessionsMock).toHaveBeenCalledTimes(2);
    expect(view.getByText('缓存练习')).toBeTruthy();
  });

  it('uses summary recent sessions when the sessions query fails', async () => {
    const recent = serverSession(10, { methodTitleSnapshot: '摘要最近练习' });
    fetchStatsMock.mockResolvedValue(
      statsSummary({
        totalSessions: 4,
        totalPracticeSeconds: 600,
        weeklyPracticeSeconds: 240,
        recentSessions: [recent]
      })
    );
    fetchSessionsMock.mockRejectedValue(new Error('sessions offline'));
    const store = await preferencesStore('user-a');
    const view = renderRecords(store);

    await waitFor(() => expect(view.getByText('摘要最近练习')).toBeTruthy());
    expect(view.getByText('记录更新失败')).toBeTruthy();
  });

  it('derives nonzero totals from sessions when the summary query fails', async () => {
    fetchStatsMock.mockRejectedValue(new Error('stats offline'));
    fetchSessionsMock.mockResolvedValue([
      serverSession(10, {
        methodTitleSnapshot: '列表练习',
        actualDurationSeconds: 125
      })
    ]);
    const store = await preferencesStore('user-a');
    const view = renderRecords(store);

    await waitFor(() => expect(view.getByText('列表练习')).toBeTruthy());
    expect(view.getByTestId('records-total').children).toContain('2 分 5 秒');
    expect(view.getByText('记录更新失败')).toBeTruthy();
  });

  it('renders all ledger statuses and preserves manual retry after persistence rejects', async () => {
    mockRetryNow.mockRejectedValue(new Error('storage unavailable'));
    const paused = ledgerEntry(8, 'retry-paused', { methodTitleSnapshot: '暂停同步' });
    const store = await preferencesStore('user-a', [
      ledgerEntry(10, 'local-only', { methodTitleSnapshot: '本机练习' }),
      ledgerEntry(9, 'pending', { methodTitleSnapshot: '同步中练习' }),
      paused,
      ledgerEntry(7, 'failed-terminal', { methodTitleSnapshot: '终止同步' })
    ]);
    const view = renderRecords(store);

    await waitFor(() => expect(view.getByText('同步中练习')).toBeTruthy());
    expect(view.getByText('本机记录')).toBeTruthy();
    expect(view.getByText('正在同步')).toBeTruthy();
    expect(view.getByText('记录仅保存在本机')).toBeTruthy();
    const retry = view.getByRole('button', { name: '可重试' });
    expect(StyleSheet.flatten(retry.props.style)).toMatchObject({ minHeight: 44 });

    fireEvent.press(retry);
    await waitFor(() => expect(mockRetryNow).toHaveBeenCalledWith(paused.clientSessionId));
    await waitFor(() =>
      expect(view.getByRole('button', { name: '可重试' }).props.accessibilityState)
        .toMatchObject({ busy: false, disabled: false })
    );
    expect(store.getState().localSessionLedger).toContainEqual(paused);
  });

  it('shows retry as busy and disabled until the manual retry settles', async () => {
    const retryWork = deferred<void>();
    mockRetryNow.mockReturnValue(retryWork.promise);
    const paused = ledgerEntry(10, 'retry-paused');
    const store = await preferencesStore('user-a', [paused]);
    const view = renderRecords(store);

    await waitFor(() => expect(view.getByRole('button', { name: '可重试' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: '可重试' }));
    expect(view.getByRole('button', { name: '可重试' }).props.accessibilityState)
      .toMatchObject({ busy: true, disabled: true });

    await act(async () => retryWork.resolve());
  });

  it('switches A to B stores, keys, and outboxes without rendering mixed records', async () => {
    const pendingStats = deferred<StatsSummary>();
    const pendingSessions = deferred<PracticeSession[]>();
    fetchStatsMock.mockReturnValue(pendingStats.promise);
    fetchSessionsMock.mockReturnValue(pendingSessions.promise);
    const storeA = await preferencesStore('user-a', [
      ledgerEntry(9, 'local-only', { methodTitleSnapshot: '账户 A 记录' })
    ]);
    const storeB = await preferencesStore('user-b', [
      ledgerEntry(10, 'local-only', { methodTitleSnapshot: '账户 B 记录' })
    ]);
    const outboxA = {
      drainDue: jest.fn(async (): Promise<void> => undefined),
      retryNow: jest.fn(async (): Promise<void> => undefined),
      submit: jest.fn(async (): Promise<void> => undefined)
    };
    const outboxB = {
      drainDue: jest.fn(async (): Promise<void> => undefined),
      retryNow: jest.fn(async (): Promise<void> => undefined),
      submit: jest.fn(async (): Promise<void> => undefined)
    };
    mockAuthSession = { userId: 'user-a', sessionOutbox: outboxA };
    const queryClient = createTestQueryClient();
    const view = renderRecords(storeA, queryClient);
    await waitFor(() => expect(view.getByText('账户 A 记录')).toBeTruthy());

    view.unmount();
    mockAuthSession = { userId: 'user-b', sessionOutbox: outboxB };
    const viewB = renderRecords(storeB, queryClient);

    await waitFor(() => expect(viewB.getByText('账户 B 记录')).toBeTruthy());
    expect(viewB.queryByText('账户 A 记录')).toBeNull();
    expect(outboxA.drainDue).toHaveBeenCalledTimes(1);
    expect(outboxB.drainDue).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryCache().find({
        queryKey: userQueryKeys.sessions('user-b'),
        exact: true
      })
    ).toBeDefined();
  });
});
