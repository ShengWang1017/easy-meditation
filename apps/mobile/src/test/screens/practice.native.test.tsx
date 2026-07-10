import React from 'react';
import { jest } from '@jest/globals';
import type { BreathingMethod } from '@easy-meditation/shared';
import { BREATHING_METHODS_SEED } from '@easy-meditation/shared';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import type { StateStorage } from 'zustand/middleware';

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn()
};

jest.mock(
  '@easy-meditation/shared',
  () => {
    const { z } = jest.requireActual<typeof import('zod')>('zod');
    const BREATHING_METHODS_SEED = [
      {
        id: 'box',
        slug: 'box',
        title: '盒式呼吸',
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
      },
      {
        id: 'four-seven-eight',
        slug: 'four-seven-eight',
        title: '4-7-8 呼吸',
        subtitle: '吸气 4 秒 · 屏息 7 秒 · 呼气 8 秒',
        category: 'classic',
        defaultDurationSeconds: 180,
        phases: [
          { kind: 'inhale', label: '吸气', durationSeconds: 4 },
          { kind: 'hold', label: '屏息', durationSeconds: 7 },
          { kind: 'exhale', label: '呼气', durationSeconds: 8 }
        ],
        sortOrder: 20,
        isActive: true
      },
      {
        id: 'coherent',
        slug: 'coherent',
        title: '共振呼吸',
        subtitle: '吸气 5 秒 · 呼气 5 秒',
        category: 'classic',
        defaultDurationSeconds: 300,
        phases: [
          { kind: 'inhale', label: '吸气', durationSeconds: 5 },
          { kind: 'exhale', label: '呼气', durationSeconds: 5 }
        ],
        sortOrder: 30,
        isActive: true
      }
    ];
    const phaseSchema = z.object({
      kind: z.enum(['inhale', 'hold', 'exhale']),
      label: z.string().min(1),
      durationSeconds: z.number().int().min(1).max(60)
    });

    return {
      BREATHING_METHODS_SEED,
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
      })
    };
  },
  { virtual: true }
);

jest.mock('expo-router', () => ({
  router: {
    back: () => mockRouter.back(),
    push: (href: unknown) => mockRouter.push(href),
    replace: (href: unknown) => mockRouter.replace(href)
  }
}));
jest.mock('../../api/methods', () => ({ fetchBreathingMethods: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 })
}));

import PracticeScreen from '../../../app/(tabs)/practice';
import { fetchBreathingMethods } from '../../api/methods';
import { publicQueryKeys } from '../../query/keys';
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

const fetchMethodsMock = fetchBreathingMethods as jest.MockedFunction<
  typeof fetchBreathingMethods
>;

function createMemoryStorage(): StateStorage {
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

function createRejectOnceStorage(): StateStorage {
  const values = new Map<string, string>();
  let shouldReject = true;
  return {
    async getItem(name) {
      return values.get(name) ?? null;
    },
    async setItem(name, value) {
      if (shouldReject) {
        shouldReject = false;
        throw new Error('storage unavailable');
      }
      values.set(name, value);
    },
    async removeItem(name) {
      values.delete(name);
    }
  };
}

async function createPreferencesStore(): Promise<UserPreferencesStore> {
  const store = createUserPreferencesStore('practice-screen-user', createMemoryStorage());
  await hydrateUserPreferencesStore(store);
  return store;
}

async function renderPractice(options?: {
  methods?: readonly BreathingMethod[];
  store?: UserPreferencesStore;
  seedCache?: readonly BreathingMethod[];
}) {
  if (options?.methods) {
    fetchMethodsMock.mockResolvedValueOnce([...options.methods]);
  }
  const store = options?.store ?? (await createPreferencesStore());
  const queryClient = createTestQueryClient();
  if (options?.seedCache) {
    queryClient.setQueryData(publicQueryKeys.methods, [...options.seedCache]);
  }
  const view = renderWithProviders(
    <PreferencesStoreProvider store={store}>
      <PracticeScreen />
    </PreferencesStoreProvider>,
    { queryClient }
  );

  return { ...view, store };
}

describe('PracticeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMethodsMock.mockReset();
  });

  it('renders the exact prototype copy and routes a built-in card with its fixed API id', async () => {
    const view = await renderPractice({ methods: BREATHING_METHODS_SEED });

    await waitFor(() => expect(view.getByText('呼吸训练')).toBeTruthy());
    expect(view.getByText('选择要进行的呼吸训练。')).toBeTruthy();
    expect(view.getByText('在您开始前')).toBeTruthy();
    expect(
      view.getByText('了解每项呼吸训练的工作原理并获取帮助您练习的提示。')
    ).toBeTruthy();
    for (const id of [
      'training-header',
      'training-intro',
      'mode-grid',
      'before-card',
      'training-title',
      'training-intro-copy'
    ]) {
      expect(view.UNSAFE_getByProps({ nativeID: id })).toBeTruthy();
    }

    fireEvent.press(view.getByRole('button', { name: '开始盒式呼吸法' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/session/[methodId]',
      params: { methodId: 'box' }
    });
  });

  it('routes all custom entry points to the editor and never writes a custom override', async () => {
    const view = await renderPractice({ methods: BREATHING_METHODS_SEED });
    await waitFor(() => expect(view.getByTestId('mode-card-custom')).toBeTruthy());

    for (const entryPoint of [
      '编辑自定义呼吸方式',
      '编辑自定义训练时长',
      '设置自定义呼吸方式'
    ]) {
      mockRouter.push.mockClear();
      fireEvent.press(view.getByRole('button', { name: entryPoint }));
      expect(mockRouter.push).toHaveBeenCalledWith('/custom-rhythm');
      expect(view.store.getState().durationOverrides).toEqual({});
    }
  });

  it('opens the built-in duration editor only from the label, persists, and closes', async () => {
    const view = await renderPractice({ methods: BREATHING_METHODS_SEED });
    await waitFor(() =>
      expect(view.getByRole('button', { name: '更改盒式呼吸法训练时长' })).toBeTruthy()
    );

    fireEvent.press(view.getByRole('button', { name: '更改盒式呼吸法训练时长' }));
    const input = view.getByLabelText('输入盒式呼吸法训练分钟数');
    fireEvent.changeText(input, '17.6');
    fireEvent.press(view.getByRole('button', { name: '确认盒式呼吸法训练时长' }));

    await waitFor(() => expect(view.store.getState().durationOverrides.box).toBe(18));
    expect(view.queryByLabelText('输入盒式呼吸法训练分钟数')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('closes an open duration editor from the screen backdrop without triggering a route', async () => {
    const view = await renderPractice({ methods: BREATHING_METHODS_SEED });
    await waitFor(() =>
      expect(view.getByRole('button', { name: '更改盒式呼吸法训练时长' })).toBeTruthy()
    );

    fireEvent.press(view.getByRole('button', { name: '更改盒式呼吸法训练时长' }));
    expect(view.getByLabelText('输入盒式呼吸法训练分钟数')).toBeTruthy();
    fireEvent.press(view.getByTestId('practice-duration-backdrop'));

    expect(view.queryByLabelText('输入盒式呼吸法训练分钟数')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();

    fireEvent.press(view.getByRole('button', { name: '更改盒式呼吸法训练时长' }));
    fireEvent.press(view.getByRole('button', { name: '编辑自定义呼吸方式' }));

    expect(view.queryByLabelText('输入盒式呼吸法训练分钟数')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('routes the info action and before-start card to the guide', async () => {
    const view = await renderPractice({ methods: BREATHING_METHODS_SEED });
    await waitFor(() => expect(view.getByText('在您开始前')).toBeTruthy());

    const guideEntries = view.getAllByRole('button', {
      name: '了解呼吸训练和冥想'
    });
    fireEvent.press(guideEntries[0]!);
    expect(mockRouter.push).toHaveBeenLastCalledWith('/guide');

    mockRouter.push.mockClear();
    fireEvent.press(guideEntries[1]!);
    expect(mockRouter.push).toHaveBeenCalledWith('/guide');
  });

  it('persists dismissal and removes the before-start card', async () => {
    const view = await renderPractice({ methods: BREATHING_METHODS_SEED });
    await waitFor(() => expect(view.getByText('在您开始前')).toBeTruthy());

    fireEvent.press(view.getByRole('button', { name: '关闭开始前提示' }));

    await waitFor(() => expect(view.store.getState().beforeStartDismissed).toBe(true));
    expect(view.queryByText('在您开始前')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('rolls back a failed dismissal, shows retry feedback, and succeeds on retry', async () => {
    const store = createUserPreferencesStore(
      'practice-dismiss-retry',
      createRejectOnceStorage()
    );
    await hydrateUserPreferencesStore(store);
    const view = await renderPractice({ methods: BREATHING_METHODS_SEED, store });
    await waitFor(() => expect(view.getByText('在您开始前')).toBeTruthy());

    fireEvent.press(view.getByRole('button', { name: '关闭开始前提示' }));

    await waitFor(() => expect(view.getByText('关闭失败，请重试。')).toBeTruthy());
    expect(store.getState().beforeStartDismissed).toBe(false);
    expect(view.getByText('在您开始前')).toBeTruthy();

    fireEvent.press(view.getByRole('button', { name: '重试关闭开始前提示' }));
    await waitFor(() => expect(store.getState().beforeStartDismissed).toBe(true));
    expect(view.queryByText('在您开始前')).toBeNull();
  });

  it('shows a centered retry after an initial total failure and recovers', async () => {
    fetchMethodsMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([...BREATHING_METHODS_SEED]);
    const view = await renderPractice();

    await waitFor(() => expect(view.getByText('呼吸训练暂时不可用')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: '重试' }));

    await waitFor(() => expect(view.getByTestId('mode-card-box')).toBeTruthy());
    expect(fetchMethodsMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the cached four-slot grid when a background refresh fails', async () => {
    fetchMethodsMock.mockRejectedValueOnce(new Error('refresh failed'));
    const view = await renderPractice({ seedCache: BREATHING_METHODS_SEED });

    await waitFor(() =>
      expect(
        view.getByText('无法刷新呼吸训练，当前显示上次加载的内容。')
      ).toBeTruthy()
    );
    for (const id of ['box', 'four-seven-eight', 'coherent', 'custom']) {
      expect(view.getByTestId(`mode-card-${id}`)).toBeTruthy();
    }
  });

  it('clears an active duration editor when refresh removes that fixed method', async () => {
    const view = await renderPractice({ methods: BREATHING_METHODS_SEED });
    await waitFor(() =>
      expect(view.getByRole('button', { name: '更改盒式呼吸法训练时长' })).toBeTruthy()
    );
    fireEvent.press(view.getByRole('button', { name: '更改盒式呼吸法训练时长' }));
    expect(view.getByTestId('practice-duration-backdrop')).toBeTruthy();

    fetchMethodsMock.mockResolvedValueOnce(
      BREATHING_METHODS_SEED.filter((method) => method.id !== 'box')
    );
    await act(async () => {
      await view.queryClient.refetchQueries({ queryKey: publicQueryKeys.methods });
    });

    await waitFor(() =>
      expect(view.getByTestId('mode-card-box').props.accessibilityState).toMatchObject({
        disabled: true
      })
    );
    expect(view.queryByTestId('practice-duration-backdrop')).toBeNull();
    expect(view.queryByLabelText('输入盒式呼吸法训练分钟数')).toBeNull();

    fireEvent.press(
      view.getAllByRole('button', { name: '了解呼吸训练和冥想' })[0]!
    );
    expect(mockRouter.push).toHaveBeenCalledWith('/guide');
  });

  it('keeps a missing fixed method disabled and exposes a retryable quiet warning', async () => {
    const withoutLongExhale = BREATHING_METHODS_SEED.filter(
      (method) => method.id !== 'four-seven-eight'
    );
    fetchMethodsMock
      .mockResolvedValueOnce(withoutLongExhale)
      .mockResolvedValueOnce([...BREATHING_METHODS_SEED]);
    const view = await renderPractice();

    await waitFor(() =>
      expect(view.getByText('部分呼吸训练暂时不可用，请重试。')).toBeTruthy()
    );
    expect(view.getByTestId('mode-card-four-seven-eight').props.accessibilityState).toMatchObject({
      disabled: true
    });
    fireEvent.press(view.getByTestId('mode-card-four-seven-eight'));
    expect(mockRouter.push).not.toHaveBeenCalled();

    fireEvent.press(view.getByRole('button', { name: '重试' }));
    await waitFor(() =>
      expect(view.queryByText('部分呼吸训练暂时不可用，请重试。')).toBeNull()
    );
    expect(fetchMethodsMock).toHaveBeenCalledTimes(2);
    expect(view.getByTestId('mode-card-four-seven-eight').props.accessibilityState).toMatchObject({
      disabled: false
    });
  });
});
