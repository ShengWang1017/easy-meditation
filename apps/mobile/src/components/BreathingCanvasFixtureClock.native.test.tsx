import React from 'react';
import { jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

const mockUseClock = jest.fn(() => ({ value: 0 }));
const skiaJestModule = jest.requireMock<
  typeof import('@shopify/react-native-skia')
>('@shopify/react-native-skia');
Object.assign(skiaJestModule, { useClock: () => mockUseClock() });

const { BreathingCanvas } = require('./BreathingCanvas') as typeof import('./BreathingCanvas');

const phases = [
  { kind: 'inhale' as const, label: '吸气', durationSeconds: 4 },
  { kind: 'hold' as const, label: '屏息', durationSeconds: 4 },
  { kind: 'exhale' as const, label: '呼气', durationSeconds: 4 },
  { kind: 'hold' as const, label: '屏息', durationSeconds: 4 }
];

const commonProps = {
  phaseDurationMs: 4_000,
  phaseIndex: 0,
  phaseKind: 'inhale' as const,
  phaseProgress: 0.5,
  phases,
  reducedMotion: false,
  status: 'running' as const
};

describe('BreathingCanvas fixture clock isolation', () => {
  beforeEach(() => {
    mockUseClock.mockClear();
  });

  it('does not mount the Skia clock for a fixed fixture frame', () => {
    render(<BreathingCanvas {...commonProps} fixtureVisualTimeMs={2_000} />);

    expect(mockUseClock).not.toHaveBeenCalled();
  });

  it('keeps the Skia clock mounted for normal live rendering', () => {
    render(<BreathingCanvas {...commonProps} />);

    expect(mockUseClock).toHaveBeenCalledTimes(1);
  });
});
