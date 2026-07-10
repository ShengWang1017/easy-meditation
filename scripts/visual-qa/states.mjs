const WEB_ROOT = 'http://127.0.0.1:60323/?visualQaState=';
const SESSION_PRIMARY = [
  'focus-running-view',
  'focus-phase-readout',
  'breath-stage',
  'focus-actions'
];
const SESSION_TEXT = ['focus-phase-copy', 'focus-timer'];

export const VISUAL_QA_STATES = [
  {
    id: 'practice',
    webUrl: `${WEB_ROOT}practice`,
    nativeUrl: 'easy-meditation:///practice?visualQaState=practice',
    primaryElementIds: [
      'training-header',
      'training-intro',
      'mode-grid',
      'before-card',
      'bottom-nav'
    ],
    textElementIds: ['training-title', 'training-intro-copy']
  },
  {
    id: 'guide',
    webUrl: `${WEB_ROOT}guide`,
    nativeUrl: 'easy-meditation:///guide?visualQaState=guide',
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
  {
    id: 'custom',
    webUrl: `${WEB_ROOT}custom`,
    nativeUrl: 'easy-meditation:///custom-rhythm?visualQaState=custom',
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
  {
    id: 'session-ready',
    webUrl: `${WEB_ROOT}session-ready`,
    nativeUrl:
      'easy-meditation:///session/box?visualQaState=session-ready',
    primaryElementIds: [
      'focus-start-view',
      'focus-title',
      'breath-stage',
      'focus-duration',
      'focus-start'
    ],
    textElementIds: ['focus-title', 'focus-duration']
  },
  ...[
    'session-inhale',
    'session-hold',
    'session-exhale',
    'session-paused',
    'session-completed'
  ].map((id) => ({
    id,
    webUrl: `${WEB_ROOT}${id}`,
    nativeUrl: `easy-meditation:///session/box?visualQaState=${id}`,
    primaryElementIds: [...SESSION_PRIMARY],
    textElementIds: [...SESSION_TEXT]
  })),
  {
    id: 'records-empty',
    webUrl: `${WEB_ROOT}records-empty`,
    nativeUrl: 'easy-meditation:///records?visualQaState=records-empty',
    primaryElementIds: [
      'records-view',
      'records-stats',
      'records-heatmap',
      'records-list',
      'bottom-nav'
    ],
    textElementIds: ['records-title', 'records-total']
  },
  {
    id: 'records-populated',
    webUrl: `${WEB_ROOT}records-populated`,
    nativeUrl: 'easy-meditation:///records?visualQaState=records-populated',
    primaryElementIds: [
      'records-view',
      'records-stats',
      'records-heatmap',
      'records-list',
      'bottom-nav'
    ],
    textElementIds: ['records-title', 'records-total']
  },
  {
    id: 'login',
    webUrl: `${WEB_ROOT}login`,
    nativeUrl: 'easy-meditation:///login?visualQaState=login',
    primaryElementIds: ['auth-screen', 'auth-form', 'auth-actions'],
    textElementIds: ['auth-eyebrow', 'auth-title', 'auth-subtitle']
  },
  {
    id: 'register',
    webUrl: `${WEB_ROOT}register`,
    nativeUrl: 'easy-meditation:///register?visualQaState=register',
    primaryElementIds: ['auth-screen', 'auth-form', 'auth-actions'],
    textElementIds: ['auth-eyebrow', 'auth-title', 'auth-subtitle']
  }
];

export function getVisualQaState(id) {
  const state = VISUAL_QA_STATES.find((candidate) => candidate.id === id);
  if (!state) {
    throw new Error(`Unknown visual QA state: ${id}`);
  }
  return state;
}
