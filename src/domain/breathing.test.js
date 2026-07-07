import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  BREATHING_METHODS,
  getPhaseAtElapsed,
  getSessionSnapshot,
  secondsToLabel
} from './breathing.js';

describe('breathing timing', () => {
  test('offers three classic modes plus one custom mode', () => {
    const modes = Object.values(BREATHING_METHODS);

    assert.deepEqual(modes.map((method) => method.id), ['box', 'fourSevenEight', 'coherent', 'custom']);
    assert.equal(modes.filter((method) => method.category === 'classic').length, 3);
    assert.equal(modes.filter((method) => method.category === 'custom').length, 1);
  });

  test('provides compact rhythm labels for mode cards', () => {
    assert.deepEqual(Object.values(BREATHING_METHODS).map((method) => method.rhythmLabel), [
      '4-4-4-4',
      '4-7-8',
      '5-5',
      '4-2-5'
    ]);
  });

  test('box breathing advances through four 4-second phases', () => {
    const method = BREATHING_METHODS.box;

    assert.deepEqual(pickPhase(getPhaseAtElapsed(method, 0, 180)), { label: '吸气', remainingInPhase: 4 });
    assert.deepEqual(pickPhase(getPhaseAtElapsed(method, 4, 180)), { label: '屏息', remainingInPhase: 4 });
    assert.deepEqual(pickPhase(getPhaseAtElapsed(method, 8, 180)), { label: '呼气', remainingInPhase: 4 });
    assert.deepEqual(pickPhase(getPhaseAtElapsed(method, 12, 180)), { label: '屏息', remainingInPhase: 4 });
    assert.deepEqual(pickPhase(getPhaseAtElapsed(method, 16, 180)), { label: '吸气', remainingInPhase: 4 });
  });

  test('truncates a phase when the session ends before the phase duration', () => {
    const method = BREATHING_METHODS.coherent;
    const snapshot = getPhaseAtElapsed(method, 118, 120);

    assert.equal(snapshot.label, '呼气');
    assert.equal(snapshot.remainingInPhase, 2);
    assert.equal(snapshot.remainingInSession, 2);
    assert.equal(snapshot.isComplete, false);
  });

  test('marks the snapshot complete at total duration', () => {
    const snapshot = getSessionSnapshot(BREATHING_METHODS.fourSevenEight, 120, 120);

    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.remainingInSession, 0);
    assert.equal(snapshot.label, '完成');
  });

  test('formats seconds as minute labels', () => {
    assert.equal(secondsToLabel(180), '03:00');
    assert.equal(secondsToLabel(61), '01:01');
    assert.equal(secondsToLabel(5), '00:05');
  });
});

function pickPhase(snapshot) {
  return {
    label: snapshot.label,
    remainingInPhase: snapshot.remainingInPhase
  };
}
