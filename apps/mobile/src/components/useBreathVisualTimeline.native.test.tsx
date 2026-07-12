import React from 'react';
import { jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { AppState, View, type AppStateStatus } from 'react-native';
import {
  configureReanimatedLogger,
  makeMutable
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { getBreathMotion } from '../domain/breathMotion';
import type { BreathVisualInput } from '../domain/breathVisualTimeline';
import { useBreathVisualTimeline } from './useBreathVisualTimeline';

let appStateListener: ((state: AppStateStatus) => void) | null = null;
const defaultAppStateCurrentState = AppState.currentState;

const inhaleInput: BreathVisualInput = {
  phaseKey: '0:0',
  kind: 'inhale',
  phaseElapsedMs: 0,
  phaseDurationMs: 4_000,
  ambientElapsedMs: 0,
  status: 'running',
  reducedMotion: false
};

function TimelineProbe({
  clock,
  input,
  isFixture = false
}: {
  clock: SharedValue<number>;
  input: BreathVisualInput;
  isFixture?: boolean;
}) {
  const timeline = useBreathVisualTimeline(input, clock, isFixture);
  const snapshot = {
    progress: timeline.projection.value.phaseProgress,
    ambientTimeMs: timeline.ambientTimeMs.value,
    scale: timeline.motion.value.scale
  };
  return (
    <View
      testID="timeline-probe"
      accessibilityLabel={JSON.stringify(snapshot)}
    />
  );
}

function readTimeline(view: ReturnType<typeof render>) {
  return JSON.parse(
    view.getByTestId('timeline-probe').props.accessibilityLabel
  ) as { progress: number; ambientTimeMs: number; scale: number };
}

function renderInFlightCorrection() {
  const clock = makeMutable(0);
  const runningInhale: BreathVisualInput = {
    ...inhaleInput,
    phaseElapsedMs: 4_000,
    ambientElapsedMs: 4_000
  };
  const view = render(
    <TimelineProbe clock={clock} input={runningInhale} />
  );
  act(() => jest.advanceTimersByTime(17));

  const runningExhale: BreathVisualInput = {
    ...runningInhale,
    phaseKey: '0:2',
    kind: 'exhale',
    phaseElapsedMs: 2_000,
    ambientElapsedMs: 6_000
  };
  view.rerender(<TimelineProbe clock={clock} input={runningExhale} />);
  act(() => jest.advanceTimersByTime(17));
  view.rerender(<TimelineProbe clock={clock} input={runningExhale} />);
  act(() => {
    clock.value = 150;
    jest.advanceTimersByTime(34);
  });
  view.rerender(<TimelineProbe clock={clock} input={runningExhale} />);

  return { clock, runningExhale, view, visible: readTimeline(view) };
}

describe('useBreathVisualTimeline', () => {
  beforeAll(() => {
    configureReanimatedLogger({ strict: false });
  });

  afterAll(() => {
    configureReanimatedLogger({ strict: true });
  });

  beforeEach(() => {
    AppState.currentState = 'active';
  });

  afterEach(() => {
    appStateListener = null;
    AppState.currentState = defaultAppStateCurrentState;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('projects live frames and preserves ambient time across background recovery', () => {
    jest.useFakeTimers();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    const clock = makeMutable(0);
    const view = render(<TimelineProbe clock={clock} input={inhaleInput} />);
    act(() => jest.advanceTimersByTime(17));

    act(() => {
      clock.value = 250;
      jest.advanceTimersByTime(17);
    });
    view.rerender(<TimelineProbe clock={clock} input={inhaleInput} />);
    expect(readTimeline(view)).toMatchObject({
      progress: 0.0625,
      ambientTimeMs: 250
    });

    act(() => {
      appStateListener?.('background');
      jest.advanceTimersByTime(17);
    });
    act(() => {
      clock.value = 10_000;
      jest.advanceTimersByTime(17);
    });
    view.rerender(<TimelineProbe clock={clock} input={inhaleInput} />);
    expect(readTimeline(view).ambientTimeMs).toBe(250);

    const foregroundInput = {
      ...inhaleInput,
      phaseElapsedMs: 2_000,
      ambientElapsedMs: 10_000
    };
    act(() => {
      appStateListener?.('active');
      jest.advanceTimersByTime(17);
    });
    view.rerender(<TimelineProbe clock={clock} input={foregroundInput} />);
    expect(readTimeline(view).ambientTimeMs).toBe(250);
    view.unmount();
  });

  it.each(['background', 'inactive'] as const)(
    'freezes immediately when mounted while AppState is %s',
    (initialState) => {
      jest.useFakeTimers();
      AppState.currentState = initialState;
      const appStateSpy = jest
        .spyOn(AppState, 'addEventListener')
        .mockImplementation((_, listener) => {
          appStateListener = listener;
          return { remove: jest.fn() };
        });
      const clock = makeMutable(250);
      const initialInput: BreathVisualInput = {
        ...inhaleInput,
        phaseElapsedMs: 250,
        ambientElapsedMs: 250
      };
      const view = render(
        <TimelineProbe clock={clock} input={initialInput} />
      );
      act(() => jest.advanceTimersByTime(17));
      view.rerender(<TimelineProbe clock={clock} input={initialInput} />);
      const visible = readTimeline(view);

      const foregroundInput: BreathVisualInput = {
        ...inhaleInput,
        phaseElapsedMs: 2_000,
        ambientElapsedMs: 10_000
      };
      act(() => {
        clock.value = 10_000;
        jest.advanceTimersByTime(34);
      });
      view.rerender(
        <TimelineProbe clock={clock} input={foregroundInput} />
      );
      act(() => jest.advanceTimersByTime(17));
      view.rerender(
        <TimelineProbe clock={clock} input={foregroundInput} />
      );
      expect(readTimeline(view)).toEqual(visible);

      act(() => {
        appStateListener?.('active');
        jest.advanceTimersByTime(17);
      });
      view.rerender(
        <TimelineProbe clock={clock} input={foregroundInput} />
      );
      expect(readTimeline(view)).toEqual({
        progress: 0.5,
        ambientTimeMs: 250,
        scale: visible.scale
      });

      act(() => {
        clock.value = 10_300;
        jest.advanceTimersByTime(34);
      });
      view.rerender(
        <TimelineProbe clock={clock} input={foregroundInput} />
      );
      expect(readTimeline(view)).toEqual({
        progress: 0.575,
        ambientTimeMs: 550,
        scale: getBreathMotion('inhale', 0.575, 550).scale
      });

      view.unmount();
      appStateSpy.mockRestore();
    }
  );

  it('does not subscribe to AppState for a fixed fixture', () => {
    const appStateSpy = jest.spyOn(AppState, 'addEventListener');
    appStateSpy.mockClear();
    const clock = makeMutable(2_000);
    const view = render(
      <TimelineProbe
        clock={clock}
        input={{
          ...inhaleInput,
          phaseElapsedMs: 2_000,
          ambientElapsedMs: 2_000
        }}
        isFixture
      />
    );
    expect(appStateSpy).not.toHaveBeenCalled();
    view.unmount();
    appStateSpy.mockRestore();
  });

  it('falls back to a stable frame when the initial clock is non-finite', () => {
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(() => ({ remove: jest.fn() }));
    const view = render(
      <TimelineProbe clock={makeMutable(Number.NaN)} input={inhaleInput} />
    );

    expect(readTimeline(view)).toMatchObject({
      progress: 0,
      ambientTimeMs: 0,
      scale: 0.7
    });
    view.unmount();
    appStateSpy.mockRestore();
  });

  it('retains the last finite frame and rebases after a non-finite clock sample', () => {
    jest.useFakeTimers();
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(() => ({ remove: jest.fn() }));
    const clock = makeMutable(100);
    const view = render(<TimelineProbe clock={clock} input={inhaleInput} />);
    act(() => jest.advanceTimersByTime(17));

    act(() => {
      clock.value = 600;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={inhaleInput} />);
    expect(readTimeline(view)).toMatchObject({
      progress: 0.125,
      ambientTimeMs: 500
    });

    act(() => {
      clock.value = Number.NaN;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={inhaleInput} />);
    expect(readTimeline(view)).toMatchObject({
      progress: 0.125,
      ambientTimeMs: 500
    });

    act(() => {
      clock.value = 50;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={inhaleInput} />);
    expect(readTimeline(view)).toMatchObject({
      progress: 0.125,
      ambientTimeMs: 500
    });

    act(() => {
      clock.value = 150;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={inhaleInput} />);
    expect(readTimeline(view)).toMatchObject({
      progress: 0.15,
      ambientTimeMs: 600
    });

    view.unmount();
    appStateSpy.mockRestore();
  });

  it('corrects a new phase that arrives paused without snapping its target', () => {
    jest.useFakeTimers();
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(() => ({ remove: jest.fn() }));
    const clock = makeMutable(0);
    const runningInput: BreathVisualInput = {
      ...inhaleInput,
      phaseElapsedMs: 4_000,
      ambientElapsedMs: 4_000
    };
    const view = render(
      <TimelineProbe clock={clock} input={runningInput} />
    );
    act(() => jest.advanceTimersByTime(17));
    expect(readTimeline(view)).toMatchObject({
      progress: 1,
      ambientTimeMs: 4_000,
      scale: 1.08
    });

    const pausedExhale: BreathVisualInput = {
      ...runningInput,
      phaseKey: '0:2',
      kind: 'exhale',
      phaseElapsedMs: 2_000,
      ambientElapsedMs: 6_000,
      status: 'paused'
    };
    view.rerender(<TimelineProbe clock={clock} input={pausedExhale} />);
    act(() => jest.advanceTimersByTime(17));
    view.rerender(<TimelineProbe clock={clock} input={pausedExhale} />);
    expect(readTimeline(view)).toMatchObject({
      progress: 0.5,
      ambientTimeMs: 4_000,
      scale: 1.08
    });

    act(() => {
      clock.value = 150;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={pausedExhale} />);
    expect(readTimeline(view)).toMatchObject({
      progress: 0.5,
      ambientTimeMs: 4_000
    });
    expect(readTimeline(view).scale).toBeCloseTo(0.91375, 8);

    act(() => {
      clock.value = 300;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={pausedExhale} />);
    expect(readTimeline(view)).toMatchObject({
      progress: 0.5,
      ambientTimeMs: 4_000,
      scale: 0.89
    });

    view.unmount();
    appStateSpy.mockRestore();
  });

  it('corrects an already-paused same-phase timing gap above tolerance', () => {
    jest.useFakeTimers();
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(() => ({ remove: jest.fn() }));
    const clock = makeMutable(0);
    const pausedInput: BreathVisualInput = {
      ...inhaleInput,
      phaseElapsedMs: 1_500,
      ambientElapsedMs: 1_500,
      status: 'paused'
    };
    const view = render(<TimelineProbe clock={clock} input={pausedInput} />);
    act(() => jest.advanceTimersByTime(17));

    const correctedInput = {
      ...pausedInput,
      phaseElapsedMs: 1_650,
      ambientElapsedMs: 1_650
    };
    view.rerender(<TimelineProbe clock={clock} input={correctedInput} />);
    act(() => jest.advanceTimersByTime(17));
    view.rerender(<TimelineProbe clock={clock} input={correctedInput} />);
    expect(readTimeline(view)).toMatchObject({
      progress: 0.4125,
      ambientTimeMs: 1_500,
      scale: getBreathMotion('inhale', 0.375, 1_500).scale
    });

    act(() => {
      clock.value = 300;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={correctedInput} />);
    expect(readTimeline(view)).toMatchObject({
      progress: 0.4125,
      ambientTimeMs: 1_500,
      scale: getBreathMotion('inhale', 0.4125, 1_500).scale
    });

    view.unmount();
    appStateSpy.mockRestore();
  });

  it('freezes the composed visible motion when pausing mid-correction', () => {
    jest.useFakeTimers();
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(() => ({ remove: jest.fn() }));
    const { clock, runningExhale, view, visible } =
      renderInFlightCorrection();
    const pausedExhale: BreathVisualInput = {
      ...runningExhale,
      phaseElapsedMs: 2_150,
      ambientElapsedMs: 6_150,
      status: 'paused'
    };

    view.rerender(<TimelineProbe clock={clock} input={pausedExhale} />);
    act(() => jest.advanceTimersByTime(17));
    view.rerender(<TimelineProbe clock={clock} input={pausedExhale} />);
    expect(readTimeline(view)).toEqual(visible);

    act(() => {
      clock.value = 10_000;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={pausedExhale} />);
    expect(readTimeline(view)).toEqual(visible);

    view.unmount();
    appStateSpy.mockRestore();
  });

  it('freezes the composed visible motion when backgrounded mid-correction', () => {
    jest.useFakeTimers();
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    const { clock, runningExhale, view, visible } =
      renderInFlightCorrection();

    act(() => {
      appStateListener?.('background');
      jest.advanceTimersByTime(17);
    });
    const backgroundInput = {
      ...runningExhale,
      phaseElapsedMs: 3_000,
      ambientElapsedMs: 7_000
    };
    view.rerender(<TimelineProbe clock={clock} input={backgroundInput} />);
    act(() => jest.advanceTimersByTime(17));
    view.rerender(<TimelineProbe clock={clock} input={backgroundInput} />);
    expect(readTimeline(view)).toEqual(visible);

    act(() => {
      clock.value = 10_000;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={backgroundInput} />);
    expect(readTimeline(view)).toEqual(visible);

    view.unmount();
    appStateSpy.mockRestore();
  });

  it('applies an authoritative pause received during a non-finite frame', () => {
    jest.useFakeTimers();
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(() => ({ remove: jest.fn() }));
    const clock = makeMutable(0);
    const view = render(<TimelineProbe clock={clock} input={inhaleInput} />);
    act(() => jest.advanceTimersByTime(17));
    act(() => {
      clock.value = 250;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={inhaleInput} />);
    const visible = readTimeline(view);

    act(() => {
      clock.value = Number.NaN;
      jest.advanceTimersByTime(34);
    });
    const pausedInput: BreathVisualInput = {
      ...inhaleInput,
      phaseElapsedMs: 250,
      ambientElapsedMs: 250,
      status: 'paused'
    };
    view.rerender(<TimelineProbe clock={clock} input={pausedInput} />);
    act(() => jest.advanceTimersByTime(17));
    view.rerender(<TimelineProbe clock={clock} input={pausedInput} />);
    expect(readTimeline(view)).toEqual(visible);

    act(() => {
      clock.value = 5_000;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={pausedInput} />);
    expect(readTimeline(view)).toEqual(visible);

    view.unmount();
    appStateSpy.mockRestore();
  });

  it('applies background received during a non-finite frame and reconciles on foreground', () => {
    jest.useFakeTimers();
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    const clock = makeMutable(0);
    const view = render(<TimelineProbe clock={clock} input={inhaleInput} />);
    act(() => jest.advanceTimersByTime(17));
    act(() => {
      clock.value = 250;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={inhaleInput} />);
    const visible = readTimeline(view);

    act(() => {
      clock.value = Number.NaN;
      jest.advanceTimersByTime(34);
      appStateListener?.('background');
      jest.advanceTimersByTime(17);
    });
    const foregroundInput: BreathVisualInput = {
      ...inhaleInput,
      phaseElapsedMs: 2_000,
      ambientElapsedMs: 10_000
    };
    view.rerender(<TimelineProbe clock={clock} input={foregroundInput} />);
    act(() => jest.advanceTimersByTime(17));
    view.rerender(<TimelineProbe clock={clock} input={foregroundInput} />);
    expect(readTimeline(view)).toEqual(visible);

    act(() => {
      clock.value = 10_000;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={foregroundInput} />);
    expect(readTimeline(view)).toEqual(visible);

    act(() => {
      appStateListener?.('active');
      jest.advanceTimersByTime(17);
    });
    view.rerender(<TimelineProbe clock={clock} input={foregroundInput} />);
    expect(readTimeline(view)).toEqual({
      progress: 0.5,
      ambientTimeMs: 250,
      scale: visible.scale
    });

    act(() => {
      clock.value = 10_300;
      jest.advanceTimersByTime(34);
    });
    view.rerender(<TimelineProbe clock={clock} input={foregroundInput} />);
    expect(readTimeline(view)).toEqual({
      progress: 0.575,
      ambientTimeMs: 550,
      scale: getBreathMotion('inhale', 0.575, 550).scale
    });

    view.unmount();
    appStateSpy.mockRestore();
  });
});
