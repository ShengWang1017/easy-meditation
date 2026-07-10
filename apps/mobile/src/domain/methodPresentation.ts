import type { BreathingMethod } from '@easy-meditation/shared';
import {
  DEFAULT_CUSTOM_RHYTHM,
  toCustomBreathingMethod
} from './customRhythm';
import type { CustomRhythm } from './customRhythm';

export type BuiltInMethodId = 'box' | 'four-seven-eight' | 'coherent';

export type MethodPresentationSlot = {
  id: BuiltInMethodId | 'custom';
  kind: 'built_in' | 'custom';
  order: 1 | 2 | 3 | 4;
  title: string;
  rhythmLabel: string;
  purpose: string;
  artKey: 'petalBox' | 'petalSleep' | 'petalFocus';
  availability: 'available' | 'unavailable' | 'local';
  method: BreathingMethod | null;
};

type BuiltInPresentation = Omit<
  MethodPresentationSlot,
  'kind' | 'availability' | 'method'
> & {
  id: BuiltInMethodId;
};

const BUILT_IN_PRESENTATIONS: readonly BuiltInPresentation[] = [
  {
    id: 'box',
    order: 1,
    title: '盒式呼吸法',
    rhythmLabel: '4-4-4-4',
    purpose: '放松',
    artKey: 'petalBox'
  },
  {
    id: 'four-seven-eight',
    order: 2,
    title: '长呼气',
    rhythmLabel: '4-7-8',
    purpose: '睡眠',
    artKey: 'petalSleep'
  },
  {
    id: 'coherent',
    order: 3,
    title: '等量呼吸法',
    rhythmLabel: '5-0-5',
    purpose: '专注',
    artKey: 'petalFocus'
  }
];

export function getMethodDisplayTitle(id: string): string | undefined {
  return BUILT_IN_PRESENTATIONS.find((presentation) => presentation.id === id)?.title;
}

export function buildMethodPresentationSlots(
  methods: readonly BreathingMethod[],
  customRhythm: CustomRhythm = DEFAULT_CUSTOM_RHYTHM
): MethodPresentationSlot[] {
  const builtInSlots: MethodPresentationSlot[] = BUILT_IN_PRESENTATIONS.map(
    (presentation) => {
      const method = methods.find((candidate) => candidate.id === presentation.id) ?? null;

      return {
        ...presentation,
        kind: 'built_in',
        availability: method ? 'available' : 'unavailable',
        method
      };
    }
  );

  return [
    ...builtInSlots,
    {
      id: 'custom',
      kind: 'custom',
      order: 4,
      title: '自定义',
      rhythmLabel: `${customRhythm.inhaleSeconds}-${customRhythm.holdSeconds}-${customRhythm.exhaleSeconds}`,
      purpose: '',
      artKey: 'petalBox',
      availability: 'local',
      method: toCustomBreathingMethod(customRhythm)
    }
  ];
}
