import { createMeditationApp } from './ui/app.js';
import {
  publishVisualQaError,
  publishVisualQaReady,
  resolveVisualQaRequest,
  scheduleVisualQaReady
} from './ui/visual-qa-fixture.js';

export function bootstrapMeditationApp(options = {}) {
  const document = options.document ?? globalThis.document;
  const root = document?.querySelector('#app');
  if (!root) return { app: null, request: { kind: 'normal' } };

  const window = document.defaultView ?? globalThis.window;
  const url = options.url ?? window.location.href;
  const createApp = options.createApp ?? createMeditationApp;
  const request = resolveVisualQaRequest(url);
  const consoleTarget = options.consoleTarget ?? window.console;

  if (request.kind === 'normal') {
    return { app: createApp(root), request };
  }

  if (request.kind !== 'reference') {
    const payload = {
      marker: 'VISUAL_QA_ERROR',
      kind: request.kind,
      state: request.stateId,
      reason: request.reason
    };
    publishVisualQaError({ window, root, payload, consoleTarget });
    return { app: null, request };
  }

  const app = createApp(root, request.appOptions);
  scheduleVisualQaReady({
    document,
    window,
    manifest: request.manifest,
    stateId: request.stateId,
    requestAnimationFrame:
      options.requestAnimationFrame ??
      window.requestAnimationFrame.bind(window),
    onReady: (payload) => {
      publishVisualQaReady({ window, payload, consoleTarget });
    },
    onError: (payload) => {
      publishVisualQaError({ window, root, payload, consoleTarget });
    }
  });
  return { app, request };
}

if (typeof document !== 'undefined') {
  bootstrapMeditationApp();
}
