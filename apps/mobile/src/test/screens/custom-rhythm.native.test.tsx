import React from 'react';
import { jest } from '@jest/globals';
import { FlatList, Image, StyleSheet } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import type { StateStorage } from 'zustand/middleware';

let mockHasBackEntry = true;
let mockWindowWidth = 390;
const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn()
};

jest.mock(
  '@easy-meditation/shared',
  () => {
    const { z } = jest.requireActual<typeof import('zod')>('zod');
    const breathingPhaseSchema = z.object({
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
        rhythmSnapshot: z.array(breathingPhaseSchema).min(1),
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
    canGoBack: () => mockHasBackEntry,
    push: (href: unknown) => mockRouter.push(href),
    replace: (href: unknown) => mockRouter.replace(href)
  }
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: mockWindowWidth,
    height: 844,
    scale: 3,
    fontScale: 1
  })
}));

import CustomRhythmScreen from '../../../app/custom-rhythm';
import { PrototypeScreen } from '../../components/PrototypeScreen';
import { PreferencesStoreProvider } from '../../store/PreferencesStoreProvider';
import {
  createUserPreferencesStore,
  hydrateUserPreferencesStore,
  type UserPreferencesStore
} from '../../store/preferencesStore';
import { referenceImages } from '../../theme/assets';
import { renderWithProviders } from '../renderWithProviders';

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

function createRejectOnceStorage() {
  const values = new Map<string, string>();
  const writes: string[] = [];
  let shouldReject = true;
  const setItem = jest.fn(async (name: string, value: string) => {
    writes.push(value);
    if (shouldReject) {
      shouldReject = false;
      throw new Error('preference write failed');
    }
    values.set(name, value);
  });
  const storage: StateStorage = {
    async getItem(name) {
      return values.get(name) ?? null;
    },
    setItem,
    async removeItem(name) {
      values.delete(name);
    }
  };

  return { setItem, storage, writes };
}

function createDeferredFirstWriteStorage({
  rejectAttempts = []
}: { rejectAttempts?: number[] } = {}) {
  const values = new Map<string, string>();
  const writes: string[] = [];
  let attempt = 0;
  let markFirstWriteStarted: () => void = () => undefined;
  let resolveFirstWrite: () => void = () => undefined;
  let rejectFirstWrite: (reason?: unknown) => void = () => undefined;
  const firstWriteStarted = new Promise<void>((resolve) => {
    markFirstWriteStarted = resolve;
  });
  const firstWrite = new Promise<void>((resolve, reject) => {
    resolveFirstWrite = resolve;
    rejectFirstWrite = reject;
  });
  const setItem = jest.fn(async (name: string, value: string) => {
    attempt += 1;
    writes.push(value);
    if (attempt === 1) {
      markFirstWriteStarted();
      await firstWrite;
    }
    if (rejectAttempts.includes(attempt)) {
      throw new Error(`preference write ${attempt} failed`);
    }
    values.set(name, value);
  });
  const storage: StateStorage = {
    async getItem(name) {
      return values.get(name) ?? null;
    },
    setItem,
    async removeItem(name) {
      values.delete(name);
    }
  };

  return {
    firstWriteStarted,
    rejectFirstWrite,
    resolveFirstWrite,
    setItem,
    storage,
    writes
  };
}

function persistedInhaleSeconds(value: string): number {
  return JSON.parse(value).state.customRhythm.inhaleSeconds as number;
}

async function renderCustom(store?: UserPreferencesStore) {
  const preferences = store ?? createUserPreferencesStore(
    'custom-screen-user',
    createMemoryStorage()
  );
  if (!preferences.persist.hasHydrated()) {
    await hydrateUserPreferencesStore(preferences);
  }
  const setCustomPhase = jest.spyOn(preferences.getState(), 'setCustomPhase');
  const setCustomCycleSeconds = jest.spyOn(
    preferences.getState(),
    'setCustomCycleSeconds'
  );
  const setCustomDuration = jest.spyOn(
    preferences.getState(),
    'setCustomDuration'
  );
  const view = renderWithProviders(
    <PreferencesStoreProvider store={preferences}>
      <CustomRhythmScreen />
    </PreferencesStoreProvider>
  );

  return {
    ...view,
    store: preferences,
    setCustomPhase,
    setCustomCycleSeconds,
    setCustomDuration
  };
}

describe('CustomRhythmScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasBackEntry = true;
    mockWindowWidth = 390;
  });

  it('renders the exact default values, source labels, and custom-session route', async () => {
    const view = await renderCustom();

    expect(view.getByRole('header', { name: '设置呼吸方式' })).toBeTruthy();
    expect(view.getByText('每个周期的时间')).toBeTruthy();
    expect(view.getByText('吸气')).toBeTruthy();
    expect(view.getByText('保持')).toBeTruthy();
    expect(view.getByText('呼气')).toBeTruthy();
    expect(view.getByText('呼吸目标时间')).toBeTruthy();
    expect(view.getByText('11秒')).toBeTruthy();
    expect(view.getByText('5分钟')).toBeTruthy();
    expect(
      view.getByRole('adjustable', { name: '设置吸气秒数' }).props.accessibilityValue
    ).toMatchObject({ now: 4 });
    expect(
      view.getByRole('adjustable', { name: '设置保持秒数' }).props.accessibilityValue
    ).toMatchObject({ now: 2 });
    expect(
      view.getByRole('adjustable', { name: '设置呼气秒数' }).props.accessibilityValue
    ).toMatchObject({ now: 5 });
    expect(view.queryByRole('button', { name: /保存/ })).toBeNull();
    expect(view.UNSAFE_getByType(PrototypeScreen).props).toMatchObject({
      backgroundVariant: 'custom',
      nestedScrollEnabled: true,
      scrollable: true
    });
    expect(
      view.UNSAFE_getAllByType(FlatList).every(
        (list) => list.props.nestedScrollEnabled === true
      )
    ).toBe(true);

    fireEvent.press(view.getByRole('button', { name: '开始呼吸' }));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/session/[methodId]',
        params: { methodId: 'custom' }
      })
    );
  });

  it('commits wheel values immediately and redistributes 11 seconds to 5/3/6 at 14', async () => {
    const view = await renderCustom();
    const cycleList = view.getByTestId('custom-cycle-wheel-list');

    fireEvent(cycleList, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 11 * 34 } }
    });
    await waitFor(() =>
      expect(view.setCustomCycleSeconds).toHaveBeenCalledWith(14)
    );
    await waitFor(() =>
      expect(view.store.getState().customRhythm).toMatchObject({
        inhaleSeconds: 5,
        holdSeconds: 3,
        exhaleSeconds: 6
      })
    );

    fireEvent(
      view.getByRole('adjustable', { name: '设置吸气秒数' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } }
    );
    await waitFor(() =>
      expect(view.setCustomPhase).toHaveBeenCalledWith('inhaleSeconds', 6)
    );
    await waitFor(() =>
      expect(view.store.getState().customRhythm.inhaleSeconds).toBe(6)
    );

    fireEvent(
      view.getByRole('adjustable', { name: '设置呼吸目标时间' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'decrement' } }
    );
    await waitFor(() => expect(view.setCustomDuration).toHaveBeenCalledWith(3));
    await waitFor(() =>
      expect(view.store.getState().customRhythm.durationMinutes).toBe(3)
    );
  });

  it('keeps the latest valid values when back is pressed and uses a practice fallback', async () => {
    const view = await renderCustom();

    fireEvent(
      view.getByRole('adjustable', { name: '设置呼气秒数' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } }
    );
    await waitFor(() =>
      expect(view.store.getState().customRhythm.exhaleSeconds).toBe(6)
    );
    fireEvent.press(view.getByRole('button', { name: '返回呼吸训练首页' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(view.store.getState().customRhythm.exhaleSeconds).toBe(6);

    mockHasBackEntry = false;
    mockRouter.back.mockClear();
    fireEvent.press(view.getByRole('button', { name: '返回呼吸训练首页' }));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/practice')
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(view.store.getState().customRhythm.exhaleSeconds).toBe(6);
  });

  it('restores the last persisted phase when a wheel write is rejected', async () => {
    const controlledStorage = createRejectOnceStorage();
    const store = createUserPreferencesStore(
      'custom-rejected-write-user',
      controlledStorage.storage
    );
    const view = await renderCustom(store);

    fireEvent(
      view.getByRole('adjustable', { name: '设置吸气秒数' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } }
    );

    await waitFor(() => expect(controlledStorage.setItem).toHaveBeenCalledTimes(2));
    expect(controlledStorage.writes.map(persistedInhaleSeconds)).toEqual([5, 4]);
    expect(view.store.getState().customRhythm.inhaleSeconds).toBe(4);
    expect(
      view.getByRole('adjustable', { name: '设置吸气秒数' }).props
        .accessibilityValue
    ).toMatchObject({ now: 4 });
  });

  it('serializes rapid wheel commits so an older rejection cannot override the latest value', async () => {
    const controlledStorage = createRejectOnceStorage();
    const store = createUserPreferencesStore(
      'custom-rapid-write-user',
      controlledStorage.storage
    );
    const view = await renderCustom(store);
    const inhaleList = view.getByTestId('custom-inhale-wheel-list');

    fireEvent(inhaleList, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 4 * 56 } }
    });
    fireEvent(inhaleList, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 5 * 56 } }
    });

    await waitFor(() => expect(controlledStorage.setItem).toHaveBeenCalledTimes(3));
    expect(controlledStorage.writes.map(persistedInhaleSeconds)).toEqual([5, 4, 6]);
    expect(view.store.getState().customRhythm.inhaleSeconds).toBe(6);
    expect(
      view.getByRole('adjustable', { name: '设置吸气秒数' }).props
        .accessibilityValue
    ).toMatchObject({ now: 6 });
  });

  it('keeps the durable custom queue across an unmount and remount', async () => {
    const controlledStorage = createDeferredFirstWriteStorage();
    const store = createUserPreferencesStore(
      'custom-cross-remount-user',
      controlledStorage.storage
    );
    const firstView = await renderCustom(store);

    await act(async () => {
      fireEvent(firstView.getByTestId('custom-inhale-wheel-list'), 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { x: 0, y: 4 * 56 } }
      });
      await controlledStorage.firstWriteStarted;
    });
    firstView.unmount();

    const secondView = renderWithProviders(
      <PreferencesStoreProvider store={store}>
        <CustomRhythmScreen />
      </PreferencesStoreProvider>
    );
    fireEvent(secondView.getByTestId('custom-inhale-wheel-list'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 5 * 56 } }
    });
    await act(async () => {
      controlledStorage.rejectFirstWrite(new Error('first write failed'));
      await store.getState().waitForCustomRhythmSave();
    });

    await waitFor(() => expect(controlledStorage.setItem).toHaveBeenCalledTimes(3));
    expect(controlledStorage.writes.map(persistedInhaleSeconds)).toEqual([5, 4, 6]);
    expect(store.getState().customRhythm.inhaleSeconds).toBe(6);
    expect(
      secondView.getByRole('adjustable', { name: '设置吸气秒数' }).props
        .accessibilityValue
    ).toMatchObject({ now: 6 });
  });

  it.each([
    { action: '开始呼吸', expected: 'push' as const },
    { action: '返回呼吸训练首页', expected: 'back' as const }
  ])('waits for a pending durable save before $action navigation', async ({ action, expected }) => {
    const controlledStorage = createDeferredFirstWriteStorage();
    const store = createUserPreferencesStore(
      `custom-pending-${expected}-user`,
      controlledStorage.storage
    );
    const view = await renderCustom(store);

    await act(async () => {
      fireEvent(
        view.getByRole('adjustable', { name: '设置吸气秒数' }),
        'accessibilityAction',
        { nativeEvent: { actionName: 'increment' } }
      );
      await controlledStorage.firstWriteStarted;
    });
    fireEvent.press(view.getByRole('button', { name: action }));

    expect(mockRouter[expected]).not.toHaveBeenCalled();
    await act(async () => {
      controlledStorage.resolveFirstWrite();
      await store.getState().waitForCustomRhythmSave();
    });
    await waitFor(() => expect(mockRouter[expected]).toHaveBeenCalledTimes(1));
  });

  it('blocks navigation, surfaces rollback failure, and retries the intended value', async () => {
    const controlledStorage = createDeferredFirstWriteStorage({
      rejectAttempts: [2]
    });
    const store = createUserPreferencesStore(
      'custom-retry-save-user',
      controlledStorage.storage
    );
    const view = await renderCustom(store);

    await act(async () => {
      fireEvent(
        view.getByRole('adjustable', { name: '设置吸气秒数' }),
        'accessibilityAction',
        { nativeEvent: { actionName: 'increment' } }
      );
      await controlledStorage.firstWriteStarted;
    });
    fireEvent.press(view.getByRole('button', { name: '开始呼吸' }));
    await act(async () => {
      controlledStorage.rejectFirstWrite(new Error('first write failed'));
      await store.getState().waitForCustomRhythmSave().catch(() => undefined);
    });

    await waitFor(() =>
      expect(view.getByRole('alert', { name: '设置未保存，请重试。' })).toBeTruthy()
    );
    expect(controlledStorage.setItem).toHaveBeenCalledTimes(2);
    expect(store.getState().customRhythm.inhaleSeconds).toBe(4);
    expect(mockRouter.push).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: '重试保存' }));
      await store.getState().waitForCustomRhythmSave();
    });
    await waitFor(() =>
      expect(view.queryByRole('alert', { name: '设置未保存，请重试。' })).toBeNull()
    );
    expect(controlledStorage.setItem).toHaveBeenCalledTimes(3);
    expect(store.getState().customRhythm.inhaleSeconds).toBe(5);

    fireEvent.press(view.getByRole('button', { name: '开始呼吸' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
  });

  it('matches the source wide and compact custom geometry and back asset', async () => {
    const view = await renderCustom();

    expect(view.UNSAFE_getByType(Image).props.source).toBe(referenceImages.back);
    expect(StyleSheet.flatten(view.getByTestId('custom-screen-content').props.style)).toMatchObject({
      paddingBottom: 32,
      paddingHorizontal: 24,
      paddingTop: 32
    });
    expect(StyleSheet.flatten(view.getByTestId('custom-header').props.style)).toMatchObject({
      gap: 22,
      minHeight: 56
    });
    expect(
      StyleSheet.flatten(
        view.getByRole('button', { name: '返回呼吸训练首页' }).props.style
      )
    ).toMatchObject({ height: 46, width: 46 });
    expect(StyleSheet.flatten(view.UNSAFE_getByType(Image).props.style)).toMatchObject({
      height: 34,
      width: 34
    });
    expect(StyleSheet.flatten(view.getByTestId('custom-title').props.style)).toMatchObject({
      fontSize: 34,
      lineHeight: 36.72
    });
    expect(StyleSheet.flatten(view.getByTestId('custom-picker-panel').props.style)).toMatchObject({
      borderRadius: 30,
      marginTop: 92,
      minHeight: 386,
      paddingBottom: 25,
      paddingHorizontal: 28,
      paddingTop: 32
    });
    expect(StyleSheet.flatten(view.getByTestId('custom-start').props.style)).toMatchObject({
      borderRadius: 18,
      marginTop: 16,
      minHeight: 54,
      width: '100%'
    });

    mockWindowWidth = 380;
    view.unmount();
    const compactView = renderWithProviders(
      <PreferencesStoreProvider store={view.store}>
        <CustomRhythmScreen />
      </PreferencesStoreProvider>
    );
    expect(StyleSheet.flatten(compactView.getByTestId('custom-screen-content').props.style).paddingHorizontal).toBe(20);
    expect(StyleSheet.flatten(compactView.getByTestId('custom-header').props.style).gap).toBe(18);
    expect(StyleSheet.flatten(compactView.getByTestId('custom-title').props.style).fontSize).toBe(30);
    expect(StyleSheet.flatten(compactView.getByTestId('custom-picker-panel').props.style)).toMatchObject({
      borderRadius: 28,
      marginTop: 82,
      minHeight: 360,
      paddingBottom: 22,
      paddingHorizontal: 23,
      paddingTop: 28
    });
    expect(
      StyleSheet.flatten(
        compactView.UNSAFE_getAllByType(FlatList).find(
          (list) => list.props.testID === 'custom-inhale-wheel-list'
        )?.props.style
      ).width
    ).toBe(68);
  });
});
