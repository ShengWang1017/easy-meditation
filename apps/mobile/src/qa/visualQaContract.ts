export const VISUAL_QA_STATES = [
  'practice',
  'guide',
  'custom',
  'session-ready',
  'session-inhale',
  'session-hold',
  'session-exhale',
  'session-paused',
  'session-completed',
  'records-empty',
  'records-populated',
  'login',
  'register'
] as const;

export type VisualQaState = (typeof VISUAL_QA_STATES)[number];

export type VisualQaStateDefinition = {
  route:
    | '/(tabs)/practice'
    | '/guide'
    | '/custom-rhythm'
    | '/session/box'
    | '/(tabs)/records'
    | '/(auth)/login'
    | '/(auth)/register';
  primaryElementIds: readonly string[];
  textElementIds: readonly string[];
};

const SESSION_PRIMARY = [
  'focus-running-view',
  'focus-phase-readout',
  'breath-stage',
  'focus-actions'
] as const;
const SESSION_TEXT = ['focus-phase-copy', 'focus-timer'] as const;

export const VISUAL_QA_STATE_DEFINITIONS = {
  practice: {
    route: '/(tabs)/practice',
    primaryElementIds: [
      'training-header',
      'training-intro',
      'mode-grid',
      'before-card',
      'bottom-nav'
    ],
    textElementIds: ['training-title', 'training-intro-copy']
  },
  guide: {
    route: '/guide',
    primaryElementIds: [
      'guide-header',
      'guide-copy',
      'guide-panel',
      'guide-list'
    ],
    textElementIds: [
      'guide-title',
      'guide-kicker',
      'guide-heading',
      'guide-panel-body'
    ]
  },
  custom: {
    route: '/custom-rhythm',
    primaryElementIds: [
      'custom-settings-header',
      'custom-panel',
      'custom-cycle-row',
      'custom-wheel-grid',
      'custom-target-row',
      'custom-start'
    ],
    textElementIds: [
      'custom-title',
      'custom-cycle-label',
      'custom-target-label'
    ]
  },
  'session-ready': {
    route: '/session/box',
    primaryElementIds: [
      'focus-start-view',
      'focus-title',
      'breath-stage',
      'focus-duration',
      'focus-start'
    ],
    textElementIds: ['focus-title', 'focus-duration']
  },
  'session-inhale': {
    route: '/session/box',
    primaryElementIds: SESSION_PRIMARY,
    textElementIds: SESSION_TEXT
  },
  'session-hold': {
    route: '/session/box',
    primaryElementIds: SESSION_PRIMARY,
    textElementIds: SESSION_TEXT
  },
  'session-exhale': {
    route: '/session/box',
    primaryElementIds: SESSION_PRIMARY,
    textElementIds: SESSION_TEXT
  },
  'session-paused': {
    route: '/session/box',
    primaryElementIds: SESSION_PRIMARY,
    textElementIds: SESSION_TEXT
  },
  'session-completed': {
    route: '/session/box',
    primaryElementIds: SESSION_PRIMARY,
    textElementIds: SESSION_TEXT
  },
  'records-empty': {
    route: '/(tabs)/records',
    primaryElementIds: [
      'records-view',
      'records-stats',
      'records-heatmap',
      'records-list',
      'bottom-nav'
    ],
    textElementIds: ['records-title', 'records-total']
  },
  'records-populated': {
    route: '/(tabs)/records',
    primaryElementIds: [
      'records-view',
      'records-stats',
      'records-heatmap',
      'records-list',
      'bottom-nav'
    ],
    textElementIds: ['records-title', 'records-total']
  },
  login: {
    route: '/(auth)/login',
    primaryElementIds: ['auth-screen', 'auth-form', 'auth-actions'],
    textElementIds: ['auth-eyebrow', 'auth-title', 'auth-subtitle']
  },
  register: {
    route: '/(auth)/register',
    primaryElementIds: ['auth-screen', 'auth-form', 'auth-actions'],
    textElementIds: ['auth-eyebrow', 'auth-title', 'auth-subtitle']
  }
} as const satisfies Record<VisualQaState, VisualQaStateDefinition>;
