import React, { useLayoutEffect } from 'react';
import { jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react-native';
import { PixelRatio, type StyleProp, type TextStyle } from 'react-native';

const mockInsets = { top: 47, right: 3, bottom: 34, left: 2 };

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<
    typeof import('react-native-safe-area-context')
  >('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => mockInsets
  };
});

import {
  VisualQaReporter,
  useVisualQaRegistration,
  type VisualQaMeasurableNode
} from './VisualQaReporter';
import {
  VISUAL_QA_STATE_DEFINITIONS,
  type VisualQaState
} from './visualQaContract';

type FrameCallback = (time: number) => void;

let nextFrameId = 1;
let frameCallbacks = new Map<number, FrameCallback>();
let cancelledFrames = new Set<number>();

function flushFrame(includeCancelled = false) {
  const pending = [...frameCallbacks.entries()];
  frameCallbacks = new Map();
  for (const [id, callback] of pending) {
    if (includeCancelled || !cancelledFrames.has(id)) {
      callback(0);
    }
  }
}

function measurable(index: number): VisualQaMeasurableNode {
  return {
    measureInWindow(callback) {
      callback(10 + index, 20 + index, 100 + index, 40 + index);
    }
  };
}

function invalidMeasurable(): VisualQaMeasurableNode {
  return {
    measureInWindow(callback) {
      callback(Number.NaN, 20, 100, 40);
    }
  };
}

const TEXT_STYLE: StyleProp<TextStyle> = {
  fontFamily: 'LXGWWenKai-Medium',
  fontWeight: '800',
  fontSize: 32,
  lineHeight: 38
};

function RegistrationProbe({
  id,
  index,
  invalid = false,
  text
}: {
  id: string;
  index: number;
  invalid?: boolean;
  text: boolean;
}) {
  const registration = useVisualQaRegistration(
    id,
    text ? { textStyle: TEXT_STYLE } : undefined
  );

  useLayoutEffect(() => {
    registration.ref(invalid ? invalidMeasurable() : measurable(index));
    if (text) {
      registration.onTextLayout?.({
        nativeEvent: { lines: [{ text: 'fixture line' }] }
      } as never);
    }
    return () => registration.ref(null);
  }, [index, invalid, registration, text]);

  return null;
}

function CompleteRegistry({
  state,
  invalid,
  omit
}: {
  state: VisualQaState;
  invalid?: string;
  omit?: string;
}) {
  const definition = VISUAL_QA_STATE_DEFINITIONS[state];
  const textIds = new Set<string>(definition.textElementIds);
  const ids = [
    ...definition.primaryElementIds,
    ...definition.textElementIds
  ].filter((id, index, values) => values.indexOf(id) === index && id !== omit);

  return (
    <>
      {ids.map((id, index) => (
        <RegistrationProbe
          id={id}
          index={index}
          invalid={id === invalid}
          key={id}
          text={textIds.has(id)}
        />
      ))}
    </>
  );
}

describe('VisualQaReporter', () => {
  let logSpy: jest.SpiedFunction<typeof console.log>;
  let errorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    nextFrameId = 1;
    frameCallbacks = new Map();
    cancelledFrames = new Set();
    jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback: FrameCallback) => {
        const id = nextFrameId++;
        frameCallbacks.set(id, callback);
        return id;
      });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => {
      cancelledFrames.add(id);
    });
    jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('waits two animation frames and emits one deterministic single-line payload', async () => {
    const view = render(
      <VisualQaReporter enabled state="practice">
        <CompleteRegistry state="practice" />
      </VisualQaReporter>
    );

    expect(logSpy).not.toHaveBeenCalled();
    act(() => flushFrame());
    expect(logSpy).not.toHaveBeenCalled();
    await act(async () => {
      flushFrame();
      await Promise.resolve();
    });

    await waitFor(() => expect(logSpy).toHaveBeenCalledTimes(1));
    const line = logSpy.mock.calls[0]![0];
    expect(typeof line).toBe('string');
    expect(line).not.toContain('\n');
    const payload = JSON.parse(line as string);
    expect(payload).toMatchObject({
      marker: 'VISUAL_QA_READY',
      state: 'practice',
      pixelRatio: 3,
      safeArea: mockInsets
    });
    expect(Object.keys(payload.elements).sort()).toEqual(
      [
        ...VISUAL_QA_STATE_DEFINITIONS.practice.primaryElementIds,
        ...VISUAL_QA_STATE_DEFINITIONS.practice.textElementIds
      ].sort()
    );
    expect(payload.elements['training-title']).toMatchObject({
      fontFamily: 'LXGWWenKai-Medium',
      fontWeight: '800',
      fontSize: 32,
      lineHeight: 38,
      lines: 1
    });

    view.rerender(
      <VisualQaReporter enabled state="practice">
        <CompleteRegistry state="practice" />
      </VisualQaReporter>
    );
    await act(async () => {
      flushFrame();
      flushFrame();
      await Promise.resolve();
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('refuses to emit when the registered manifest is incomplete', async () => {
    render(
      <VisualQaReporter enabled state="practice">
        <CompleteRegistry omit="before-card" state="practice" />
      </VisualQaReporter>
    );

    act(() => flushFrame());
    await act(async () => {
      flushFrame();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/missing required element: before-card/)
      )
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('fails closed with one diagnostic when native measurement is invalid', async () => {
    render(
      <VisualQaReporter enabled state="practice">
        <CompleteRegistry invalid="mode-grid" state="practice" />
      </VisualQaReporter>
    );

    act(() => flushFrame());
    await act(async () => {
      flushFrame();
      await Promise.resolve();
    });

    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/VISUAL_QA_REPORTER_ERROR practice measurement failed/)
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('cancels stale work on state swaps and emits only the replacement state', async () => {
    const view = render(
      <VisualQaReporter enabled state="practice">
        <CompleteRegistry state="practice" />
      </VisualQaReporter>
    );

    view.rerender(
      <VisualQaReporter enabled state="guide">
        <CompleteRegistry state="guide" />
      </VisualQaReporter>
    );

    act(() => flushFrame(true));
    await act(async () => {
      flushFrame(true);
      await Promise.resolve();
    });

    await waitFor(() => expect(logSpy).toHaveBeenCalledTimes(1));
    expect(JSON.parse(logSpy.mock.calls[0]![0] as string).state).toBe('guide');
  });

  it('cancels pending measurement after unmount', async () => {
    const view = render(
      <VisualQaReporter enabled state="practice">
        <CompleteRegistry state="practice" />
      </VisualQaReporter>
    );
    view.unmount();

    act(() => flushFrame(true));
    await act(async () => {
      flushFrame(true);
      await Promise.resolve();
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('produces no output and schedules no work when disabled', () => {
    render(
      <VisualQaReporter enabled={false} state="practice">
        <CompleteRegistry state="practice" />
      </VisualQaReporter>
    );

    expect(frameCallbacks.size).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
