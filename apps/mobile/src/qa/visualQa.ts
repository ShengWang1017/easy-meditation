import {
  breathingMethodSchema,
  meSchema,
  practiceSessionSchema,
  statsSummarySchema
} from '@easy-meditation/shared';
import { z } from 'zod';

import sharedFixtureJson from '../../../../qa/fixtures/mobile-prototype.json';
import {
  beforeStartDismissedSchema,
  customRhythmPreferencesSchema,
  durationOverridesSchema,
  localSessionLedgerEntrySchema,
  soundEnabledSchema
} from '../store/preferencesSchema';
import {
  VISUAL_QA_STATES,
  VISUAL_QA_STATE_DEFINITIONS,
  type VisualQaState,
  type VisualQaStateDefinition
} from './visualQaContract';

export {
  VISUAL_QA_STATES,
  VISUAL_QA_STATE_DEFINITIONS,
  type VisualQaState,
  type VisualQaStateDefinition
} from './visualQaContract';

const sessionSnapshotSchemas = {
  'session-ready': z
    .object({
      status: z.literal('idle'),
      phaseKind: z.literal('inhale'),
      phaseProgress: z.literal(0),
      elapsedSeconds: z.literal(0),
      remainingSeconds: z.literal(300)
    })
    .strict(),
  'session-inhale': z
    .object({
      status: z.literal('running'),
      phaseKind: z.literal('inhale'),
      phaseProgress: z.literal(0.5),
      elapsedSeconds: z.literal(2),
      remainingSeconds: z.literal(298)
    })
    .strict(),
  'session-hold': z
    .object({
      status: z.literal('running'),
      phaseKind: z.literal('hold'),
      phaseProgress: z.literal(0.5),
      elapsedSeconds: z.literal(6),
      remainingSeconds: z.literal(294)
    })
    .strict(),
  'session-exhale': z
    .object({
      status: z.literal('running'),
      phaseKind: z.literal('exhale'),
      phaseProgress: z.literal(0.5),
      elapsedSeconds: z.literal(10),
      remainingSeconds: z.literal(290)
    })
    .strict(),
  'session-paused': z
    .object({
      status: z.literal('paused'),
      phaseKind: z.literal('exhale'),
      phaseProgress: z.literal(0.25),
      elapsedSeconds: z.literal(9),
      remainingSeconds: z.literal(291)
    })
    .strict(),
  'session-completed': z
    .object({
      status: z.literal('completed'),
      phaseKind: z.literal('complete'),
      phaseProgress: z.literal(1),
      elapsedSeconds: z.literal(300),
      remainingSeconds: z.literal(0)
    })
    .strict()
} as const;

const unauthenticatedStateSchema = z
  .object({ authScope: z.literal('unauthenticated'), session: z.null() })
  .strict();
const authenticatedStateSchema = z
  .object({ authScope: z.literal('authenticated'), session: z.null() })
  .strict();

const visualQaFixtureSchema = z
  .object({
    version: z.literal(1),
    now: z.literal('2026-07-10T12:00:00+08:00'),
    api: z
      .object({
        me: meSchema,
        methods: breathingMethodSchema.array().refine(
          (methods) =>
            methods.map(({ id }) => id).join(',') ===
            'box,four-seven-eight,coherent',
          'Expected the three fixed built-in methods.'
        ),
        stats: z
          .object({
            empty: statsSummarySchema,
            populated: statsSummarySchema
          })
          .strict(),
        sessions: z
          .object({
            empty: practiceSessionSchema.array().length(0),
            populated: practiceSessionSchema.array().min(1)
          })
          .strict()
      })
      .strict(),
    preferences: z
      .object({
        storageKey: z.string().min(1),
        customRhythm: customRhythmPreferencesSchema,
        durationOverrides: durationOverridesSchema,
        soundEnabled: soundEnabledSchema,
        beforeStartDismissed: beforeStartDismissedSchema,
        localSessionLedger: localSessionLedgerEntrySchema.array()
      })
      .strict(),
    states: z
      .object({
        practice: authenticatedStateSchema,
        guide: authenticatedStateSchema,
        custom: authenticatedStateSchema,
        'session-ready': z
          .object({
            authScope: z.literal('authenticated'),
            session: sessionSnapshotSchemas['session-ready']
          })
          .strict(),
        'session-inhale': z
          .object({
            authScope: z.literal('authenticated'),
            session: sessionSnapshotSchemas['session-inhale']
          })
          .strict(),
        'session-hold': z
          .object({
            authScope: z.literal('authenticated'),
            session: sessionSnapshotSchemas['session-hold']
          })
          .strict(),
        'session-exhale': z
          .object({
            authScope: z.literal('authenticated'),
            session: sessionSnapshotSchemas['session-exhale']
          })
          .strict(),
        'session-paused': z
          .object({
            authScope: z.literal('authenticated'),
            session: sessionSnapshotSchemas['session-paused']
          })
          .strict(),
        'session-completed': z
          .object({
            authScope: z.literal('authenticated'),
            session: sessionSnapshotSchemas['session-completed']
          })
          .strict(),
        'records-empty': authenticatedStateSchema,
        'records-populated': authenticatedStateSchema,
        login: unauthenticatedStateSchema,
        register: unauthenticatedStateSchema
      })
      .strict()
  })
  .strict()
  .superRefine((fixture, context) => {
    if (
      fixture.preferences.storageKey !==
      `easyMeditation.preferences.${fixture.api.me.id}`
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preferences', 'storageKey'],
        message: 'Preference key must be scoped to the fixture user.'
      });
    }
  });

export type VisualQaFixture = z.infer<typeof visualQaFixtureSchema>;
type VisualQaSessionState =
  | 'session-ready'
  | 'session-inhale'
  | 'session-hold'
  | 'session-exhale'
  | 'session-paused'
  | 'session-completed';
export type VisualQaSessionSnapshot = NonNullable<
  VisualQaFixture['states'][VisualQaSessionState]['session']
>;

export type ResolvedVisualQaFixture = {
  id: VisualQaState;
  route: VisualQaStateDefinition['route'];
  manifest: (typeof VISUAL_QA_STATE_DEFINITIONS)[VisualQaState];
  now: VisualQaFixture['now'];
  authScope: 'authenticated' | 'unauthenticated';
  session: VisualQaFixture['states'][VisualQaState]['session'];
  api: VisualQaFixture['api'];
  preferences: VisualQaFixture['preferences'];
  stats: VisualQaFixture['api']['stats']['empty'];
  sessions: VisualQaFixture['api']['sessions']['empty'];
};

export function isVisualQaState(value: unknown): value is VisualQaState {
  return (
    typeof value === 'string' &&
    (VISUAL_QA_STATES as readonly string[]).includes(value)
  );
}

export function parseVisualQaFixture(input: unknown): VisualQaFixture {
  const parsed = visualQaFixtureSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const issuePath = issue?.path.length ? `.${issue.path.join('.')}` : '';
    throw new Error(
      `Visual QA fixture${issuePath}: ${issue?.message ?? 'invalid payload'}`
    );
  }
  return parsed.data;
}

export function resolveVisualQaFixture(
  options: { dev: boolean; requested: boolean; state: unknown },
  loadFixture: () => unknown = () => sharedFixtureJson
): ResolvedVisualQaFixture | null {
  if (!options.dev || !options.requested) return null;
  if (!isVisualQaState(options.state)) return null;

  const fixture = parseVisualQaFixture(loadFixture());
  const id = options.state;
  const state = fixture.states[id];
  const useEmptyRecords = id === 'records-empty';

  return {
    id,
    route: VISUAL_QA_STATE_DEFINITIONS[id].route,
    manifest: VISUAL_QA_STATE_DEFINITIONS[id],
    now: fixture.now,
    authScope: state.authScope,
    session: state.session,
    api: fixture.api,
    preferences: fixture.preferences,
    stats: useEmptyRecords ? fixture.api.stats.empty : fixture.api.stats.populated,
    sessions: useEmptyRecords
      ? fixture.api.sessions.empty
      : fixture.api.sessions.populated
  };
}
