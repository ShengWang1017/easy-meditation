import { BREATHING_METHODS_SEED } from '@easy-meditation/shared';
import type { BreathingMethod } from '@easy-meditation/shared';
import { describe, expect, test } from 'vitest';
import { DEFAULT_CUSTOM_RHYTHM } from './customRhythm';
import {
  buildMethodPresentationSlots,
  getMethodDisplayTitle
} from './methodPresentation';

function getSeedMethod(id: string): BreathingMethod {
  const method = BREATHING_METHODS_SEED.find((candidate) => candidate.id === id);
  expect(method).toBeDefined();
  return method!;
}

describe('method presentation', () => {
  test('keeps shuffled API methods in the fixed prototype order', () => {
    const box = getSeedMethod('box');
    const fourSevenEight = getSeedMethod('four-seven-eight');
    const coherent = getSeedMethod('coherent');

    const slots = buildMethodPresentationSlots(
      [coherent, box, fourSevenEight],
      DEFAULT_CUSTOM_RHYTHM
    );

    expect(slots.map((slot) => slot.id)).toEqual([
      'box',
      'four-seven-eight',
      'coherent',
      'custom'
    ]);
    expect(slots[0]!.method).toBe(box);
    expect(slots[1]!.method).toBe(fourSevenEight);
    expect(slots[2]!.method).toBe(coherent);
  });

  test('keeps missing built-ins in place as unavailable slots', () => {
    const coherent = getSeedMethod('coherent');

    const slots = buildMethodPresentationSlots([coherent], DEFAULT_CUSTOM_RHYTHM);

    expect(slots.map(({ id, availability, method }) => ({ id, availability, method }))).toEqual([
      { id: 'box', availability: 'unavailable', method: null },
      { id: 'four-seven-eight', availability: 'unavailable', method: null },
      { id: 'coherent', availability: 'available', method: coherent },
      {
        id: 'custom',
        availability: 'local',
        method: expect.objectContaining({ id: 'custom' })
      }
    ]);
  });

  test('ignores unknown API methods', () => {
    const unknown: BreathingMethod = {
      ...getSeedMethod('box'),
      id: 'future-method',
      slug: 'future-method',
      title: '未来呼吸'
    };

    const slots = buildMethodPresentationSlots([unknown], DEFAULT_CUSTOM_RHYTHM);

    expect(slots).toHaveLength(4);
    expect(slots.some((slot) => slot.id === unknown.id)).toBe(false);
    expect(slots.slice(0, 3).every((slot) => slot.method === null)).toBe(true);
  });

  test('uses the exact prototype metadata table', () => {
    const slots = buildMethodPresentationSlots(BREATHING_METHODS_SEED, DEFAULT_CUSTOM_RHYTHM);

    expect(
      slots.map(({ id, kind, order, title, rhythmLabel, purpose, artKey, availability }) => ({
        id,
        kind,
        order,
        title,
        rhythmLabel,
        purpose,
        artKey,
        availability
      }))
    ).toEqual([
      {
        id: 'box',
        kind: 'built_in',
        order: 1,
        title: '盒式呼吸法',
        rhythmLabel: '4-4-4-4',
        purpose: '放松',
        artKey: 'petalBox',
        availability: 'available'
      },
      {
        id: 'four-seven-eight',
        kind: 'built_in',
        order: 2,
        title: '长呼气',
        rhythmLabel: '4-7-8',
        purpose: '睡眠',
        artKey: 'petalSleep',
        availability: 'available'
      },
      {
        id: 'coherent',
        kind: 'built_in',
        order: 3,
        title: '等量呼吸法',
        rhythmLabel: '5-0-5',
        purpose: '专注',
        artKey: 'petalFocus',
        availability: 'available'
      },
      {
        id: 'custom',
        kind: 'custom',
        order: 4,
        title: '自定义',
        rhythmLabel: '4-2-5',
        purpose: '',
        artKey: 'petalBox',
        availability: 'local'
      }
    ]);
  });

  test('keeps coherent presentation copy separate from its authoritative API phases', () => {
    const coherent: BreathingMethod = {
      ...getSeedMethod('coherent'),
      phases: [
        { kind: 'inhale', label: '吸气', durationSeconds: 6 },
        { kind: 'exhale', label: '呼气', durationSeconds: 6 }
      ]
    };

    const coherentSlot = buildMethodPresentationSlots(
      [coherent],
      DEFAULT_CUSTOM_RHYTHM
    )[2]!;

    expect(coherentSlot.rhythmLabel).toBe('5-0-5');
    expect(coherentSlot.method).toBe(coherent);
    expect(coherentSlot.method?.phases).toEqual(coherent.phases);
  });

  test('builds the local slot from the current custom rhythm', () => {
    const slots = buildMethodPresentationSlots([], {
      name: '自定义',
      inhaleSeconds: 8,
      holdSeconds: 3,
      exhaleSeconds: 11,
      durationMinutes: 2
    });
    const customSlot = slots[3]!;

    expect(customSlot.rhythmLabel).toBe('8-3-11');
    expect(customSlot.method).toMatchObject({
      id: 'custom',
      defaultDurationSeconds: 120,
      phases: [
        { kind: 'inhale', durationSeconds: 8 },
        { kind: 'hold', durationSeconds: 3 },
        { kind: 'exhale', durationSeconds: 11 }
      ]
    });
  });

  test('maps built-in identifiers to their display titles only', () => {
    expect(getMethodDisplayTitle('box')).toBe('盒式呼吸法');
    expect(getMethodDisplayTitle('four-seven-eight')).toBe('长呼气');
    expect(getMethodDisplayTitle('coherent')).toBe('等量呼吸法');
    expect(getMethodDisplayTitle('custom')).toBeUndefined();
    expect(getMethodDisplayTitle('future-method')).toBeUndefined();
  });
});
