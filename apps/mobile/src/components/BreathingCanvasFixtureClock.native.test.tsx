import React from 'react';
import { jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { AppState } from 'react-native';

const mockUseClock = jest.fn(() => ({ value: 0 }));
const skiaJestModule = jest.requireMock<
  typeof import('@shopify/react-native-skia')
>('@shopify/react-native-skia');
Object.assign(skiaJestModule, { useClock: () => mockUseClock() });

const {
  BreathingCanvas,
  resolveBreathingCanvasFrame
} = require('./BreathingCanvas') as typeof import('./BreathingCanvas');

const phases = [
  { kind: 'inhale' as const, label: '吸气', durationSeconds: 4 },
  { kind: 'hold' as const, label: '屏息', durationSeconds: 4 },
  { kind: 'exhale' as const, label: '呼气', durationSeconds: 4 },
  { kind: 'hold' as const, label: '屏息', durationSeconds: 4 }
];

const commonProps = {
  phaseIndex: 0,
  phaseKind: 'inhale' as const,
  phases,
  reducedMotion: false,
  status: 'running' as const,
  visualTiming: {
    phaseKey: '0:0',
    phaseElapsedMs: 2_000,
    phaseDurationMs: 4_000,
    ambientElapsedMs: 2_000
  }
};

describe('BreathingCanvas fixture clock isolation', () => {
  beforeEach(() => {
    mockUseClock.mockClear();
  });

  it('keeps a fixed fixture deterministic without mounting the live clock', () => {
    const appStateSpy = jest.spyOn(AppState, 'addEventListener');
    const frameA = resolveBreathingCanvasFrame(commonProps, 2_000, 2_000);
    const frameB = resolveBreathingCanvasFrame(commonProps, 2_000, 2_000);
    expect(frameB).toEqual(frameA);

    const view = render(
      <BreathingCanvas {...commonProps} fixtureVisualTimeMs={2_000} />
    );
    expect(mockUseClock).not.toHaveBeenCalled();
    expect(appStateSpy).not.toHaveBeenCalled();
    view.unmount();
    appStateSpy.mockRestore();
  });

  it('keeps the Skia clock mounted for normal live rendering', () => {
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(() => ({ remove: jest.fn() }));
    const view = render(<BreathingCanvas {...commonProps} />);

    expect(mockUseClock).toHaveBeenCalledTimes(1);
    view.unmount();
    appStateSpy.mockRestore();
  });
});
