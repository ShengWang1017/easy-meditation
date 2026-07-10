import React from 'react';
import { jest } from '@jest/globals';
import type { BreathingMethod } from '@easy-meditation/shared';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import type { StateStorage } from 'zustand/middleware';

let mockMethodId = 'box';
const mockRouter = { back: jest.fn(), replace: jest.fn() };
const mockNavigation = { dispatch: jest.fn(), goBack: jest.fn() };
let mockSession: Record<string, unknown>;
let mockFocusOptions: Record<string, unknown> | undefined;
let mockExitOptions: Record<string, unknown> | undefined;

const mockController = {
  snapshot: sessionSnapshot('idle'),
  clientSessionId: '11111111-1111-4111-8111-111111111111',
  isPersisting: false,
  persistenceError: null as string | null,
  controlsUnlocked: true,
  start: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  persistIntentionalEnd: jest.fn(async () => undefined),
  retryPersistence: jest.fn(async () => undefined),
  replay: jest.fn(async () => undefined)
};
const mockAudio = {
  enabled: true,
  note: null as string | null,
  toggle: jest.fn(async () => undefined),
  play: jest.fn(async () => undefined),
  resetForReplay: jest.fn()
};
const mockExitController = {
  dialogVisible: false,
  continueSession: jest.fn(),
  endAndLeave: jest.fn(async () => undefined),
  retryAndLeave: jest.fn(async () => undefined),
  requestExplicitEnd: jest.fn(async () => undefined)
};

jest.mock(
  '@easy-meditation/shared',
  () => {
    const { z } = jest.requireActual<typeof import('zod')>('zod');
    const phaseSchema = z.object({
      kind: z.enum(['inhale', 'hold', 'exhale']),
      label: z.string(),
      durationSeconds: z.number()
    });
    const practiceSessionCreateSchema = z.object({
      clientSessionId: z.string().uuid(),
      methodType: z.enum(['built_in', 'custom']),
      methodId: z.string().nullable(),
      customRhythmId: z.string().uuid().nullable(),
      methodTitleSnapshot: z.string(),
      rhythmSnapshot: z.array(phaseSchema),
      plannedDurationSeconds: z.number(),
      actualDurationSeconds: z.number(),
      completed: z.boolean(),
      startedAt: z.string(),
      endedAt: z.string()
    });
    return {
      practiceSessionCreateSchema,
      practiceSessionSchema: practiceSessionCreateSchema.extend({
        id: z.string().uuid(),
        createdAt: z.string()
      }),
      secondsToTimerLabel: (totalSeconds: number) => {
        const seconds = Math.max(0, Math.floor(totalSeconds));
        return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
          seconds % 60
        ).padStart(2, '0')}`;
      }
    };
  },
  { virtual: true }
);

jest.mock('expo-router', () => ({
  router: {
    back: () => mockRouter.back(),
    replace: (href: unknown) => mockRouter.replace(href)
  },
  useLocalSearchParams: () => ({ methodId: mockMethodId })
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '99999999-9999-4999-8999-999999999999'
}));
jest.mock('../../api/methods', () => ({ fetchBreathingMethods: jest.fn() }));
jest.mock('../../auth/AuthSessionBoundary', () => ({
  useAuthSession: () => mockSession
}));
jest.mock('../../hooks/useFocusSession', () => ({
  useFocusSession: (options: Record<string, unknown>) => {
    mockFocusOptions = options;
    return mockController;
  }
}), { virtual: true });
jest.mock('../../hooks/useSessionExitGuard', () => ({
  useSessionExitGuard: (options: Record<string, unknown>) => {
    mockExitOptions = options;
    return mockExitController;
  }
}), { virtual: true });
jest.mock('../../audio/useSessionAudio', () => ({
  useSessionAudio: () => mockAudio
}));
jest.mock('../../components/BreathingCanvas', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } = jest.requireActual<typeof import('react-native')>(
    'react-native'
  );
  return {
    BreathingCanvas: (props: Record<string, unknown>) =>
      ReactModule.createElement(MockView, {
        ...props,
        testID: 'breathing-canvas'
      })
  };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 })
}));

import SessionScreen from '../../../app/session/[methodId]';
import { fetchBreathingMethods } from '../../api/methods';
import { PreferencesStoreProvider } from '../../store/PreferencesStoreProvider';
import {
  createUserPreferencesStore,
  hydrateUserPreferencesStore,
  type UserPreferencesStore
} from '../../store/preferencesStore';
import { createTestQueryClient, renderWithProviders } from '../renderWithProviders';

const fetchMethodsMock = fetchBreathingMethods as jest.MockedFunction<
  typeof fetchBreathingMethods
>;

const boxMethod: BreathingMethod = {
  id: 'box',
  slug: 'box',
  title: 'API 盒式呼吸',
  subtitle: '吸气 · 屏息 · 呼气 · 屏息',
  category: 'classic',
  defaultDurationSeconds: 180,
  phases: [
    { kind: 'inhale', label: '吸气', durationSeconds: 4 },
    { kind: 'hold', label: '屏息', durationSeconds: 4 },
    { kind: 'exhale', label: '呼气', durationSeconds: 4 },
    { kind: 'hold', label: '屏息', durationSeconds: 4 }
  ],
  sortOrder: 10,
  isActive: true
};

function sessionSnapshot(
  status: 'idle' | 'running' | 'paused' | 'completed'
) {
  const complete = status === 'completed';
  return {
    status,
    elapsedSeconds: complete ? 60 : status === 'idle' ? 0 : 2,
    remainingSeconds: complete ? 0 : status === 'idle' ? 60 : 58,
    phase: {
      kind: complete ? ('complete' as const) : ('inhale' as const),
      label: complete ? '完成' : '吸气',
      phaseIndex: 0,
      phaseProgress: complete ? 1 : 0.5,
      remainingInPhase: complete ? 0 : 4,
      remainingInSession: complete ? 0 : status === 'idle' ? 60 : 58,
      elapsedSeconds: complete ? 60 : status === 'idle' ? 0 : 2,
      isComplete: complete
    }
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

async function preferencesStore(): Promise<UserPreferencesStore> {
  const store = createUserPreferencesStore('session-screen-user', memoryStorage());
  await hydrateUserPreferencesStore(store);
  return store;
}

async function renderSession(options: {
  methodId?: string;
  methods?: BreathingMethod[];
  store?: UserPreferencesStore;
} = {}) {
  mockMethodId = options.methodId ?? 'box';
  const store = options.store ?? (await preferencesStore());
  mockSession = {
    userId: 'session-screen-user',
    preferencesStore: store,
    sessionOutbox: {
      submit: jest.fn(async () => undefined),
      drainDue: jest.fn(async () => undefined),
      retryNow: jest.fn(async () => undefined)
    }
  };
  fetchMethodsMock.mockResolvedValue(options.methods ?? [boxMethod]);
  const queryClient = createTestQueryClient();
  const view = renderWithProviders(
    <PreferencesStoreProvider store={store}>
      <SessionScreen />
    </PreferencesStoreProvider>,
    { queryClient }
  );
  return { ...view, store };
}

describe('SessionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMethodsMock.mockReset();
    mockFocusOptions = undefined;
    mockExitOptions = undefined;
    mockController.snapshot = sessionSnapshot('idle');
    mockController.isPersisting = false;
    mockController.persistenceError = null;
    mockController.controlsUnlocked = true;
    mockAudio.enabled = true;
    mockAudio.note = null;
    mockExitController.dialogVisible = false;
  });

  it('resolves a built-in display snapshot and renders exact ready-state copy', async () => {
    const store = await preferencesStore();
    await store.getState().setDurationOverride('box', 7);
    const view = await renderSession({ store });

    await waitFor(() => expect(view.getByText('准备')).toBeTruthy());
    expect(view.getByText('4-4-4-4')).toBeTruthy();
    expect(view.getByText('7 分钟')).toBeTruthy();
    expect(view.getByText('盒式呼吸法')).toBeTruthy();
    expect(view.getByTestId('focus-screen')).toBeTruthy();
    expect(view.getByTestId('breathing-canvas').props).toMatchObject({
      status: 'idle',
      phases: boxMethod.phases,
      phaseKind: 'inhale'
    });
    expect(mockFocusOptions?.method).toMatchObject({
      id: 'box',
      title: '盒式呼吸法',
      plannedDurationSeconds: 420,
      origin: 'built_in'
    });

    fireEvent.press(view.getByRole('button', { name: '开始' }));
    expect(mockController.start).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByRole('button', { name: '关闭声音' }));
    expect(mockAudio.toggle).toHaveBeenCalledTimes(1);
  });

  it('resolves custom phases and duration exclusively from the local rhythm', async () => {
    const view = await renderSession({ methodId: 'custom', methods: [] });
    await waitFor(() => expect(view.getByText('准备')).toBeTruthy());

    expect(view.getByText('4-2-5')).toBeTruthy();
    expect(view.getByText('5 分钟')).toBeTruthy();
    expect(mockFocusOptions?.method).toMatchObject({
      id: 'custom',
      title: '自定义',
      plannedDurationSeconds: 300,
      origin: 'custom'
    });
    expect(mockFocusOptions?.clockMethod).toMatchObject({
      id: 'custom',
      phases: [
        { kind: 'inhale', durationSeconds: 4 },
        { kind: 'hold', durationSeconds: 2 },
        { kind: 'exhale', durationSeconds: 5 }
      ]
    });
  });

  it('renders running, paused, and completed controls without resetting composition', async () => {
    const ready = await renderSession();
    await waitFor(() => expect(ready.getByText('准备')).toBeTruthy());
    ready.unmount();

    mockController.snapshot = sessionSnapshot('running');
    const running = await renderSession();
    await waitFor(() => expect(running.getByText('吸气')).toBeTruthy());
    expect(running.getByText('4')).toBeTruthy();
    expect(running.getByText('00:58')).toBeTruthy();
    fireEvent.press(running.getByRole('button', { name: '暂停' }));
    expect(mockController.pause).toHaveBeenCalledTimes(1);
    fireEvent.press(running.getByRole('button', { name: '结束训练' }));
    expect(mockExitController.requestExplicitEnd).toHaveBeenCalledTimes(1);
    running.unmount();

    mockController.snapshot = sessionSnapshot('paused');
    const paused = await renderSession();
    await waitFor(() => expect(paused.getByRole('button', { name: '继续' })).toBeTruthy());
    fireEvent.press(paused.getByRole('button', { name: '继续' }));
    expect(mockController.resume).toHaveBeenCalledTimes(1);
    paused.unmount();

    mockController.snapshot = sessionSnapshot('completed');
    mockController.controlsUnlocked = false;
    mockController.isPersisting = true;
    const locked = await renderSession();
    await waitFor(() => expect(locked.getAllByText('完成')).toHaveLength(2));
    expect(locked.getByRole('button', { name: '再来一次' }).props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true
    });
    locked.unmount();

    mockController.controlsUnlocked = true;
    mockController.isPersisting = false;
    const unlocked = await renderSession();
    await waitFor(() =>
      expect(unlocked.getByRole('button', { name: '再来一次' })).toBeTruthy()
    );
    fireEvent.press(unlocked.getByRole('button', { name: '再来一次' }));
    expect(mockController.replay).toHaveBeenCalledTimes(1);
  });

  it('shows non-blocking audio and local-persistence retry feedback', async () => {
    mockAudio.note = '提示音暂时不可用，本次练习将保持静音。';
    mockController.snapshot = sessionSnapshot('completed');
    mockController.controlsUnlocked = false;
    mockController.persistenceError = '无法在本机保存本次练习，请重试。';
    const view = await renderSession();

    await waitFor(() =>
      expect(view.getByText('提示音暂时不可用，本次练习将保持静音。')).toBeTruthy()
    );
    expect(view.getByText('无法在本机保存本次练习，请重试。')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: '重试保存' }));
    expect(mockController.retryPersistence).toHaveBeenCalledTimes(1);
  });

  it('renders the exit dialog and connects both confirmation actions', async () => {
    mockController.snapshot = sessionSnapshot('running');
    mockExitController.dialogVisible = true;
    const view = await renderSession();
    await waitFor(() => expect(view.getByText('要结束这次练习吗？')).toBeTruthy());

    fireEvent.press(view.getByRole('button', { name: '继续练习' }));
    fireEvent.press(view.getByRole('button', { name: '结束并离开' }));
    expect(mockExitController.continueSession).toHaveBeenCalledTimes(1);
    expect(mockExitController.endAndLeave).toHaveBeenCalledTimes(1);
    expect(mockExitOptions?.snapshot).toEqual(mockController.snapshot);
  });

  it('shows a direct return-to-practice state for an unknown method', async () => {
    const view = await renderSession({ methodId: 'missing', methods: [] });

    await waitFor(() => expect(view.getByText('没有找到这项练习')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: '返回练习页' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/practice');
  });
});
