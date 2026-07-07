import { DURATIONS_MINUTES, secondsToLabel } from '../domain/breathing.js';
import { createCuePlayer } from '../domain/audio.js';
import { createMeditationState } from './app-state.js';

const STYLE_ASSET_PATH = './src/assets/reference-style';
const PHASE_SECOND_OPTIONS = createNumberRange(1, 12);
const CYCLE_SECOND_OPTIONS = createNumberRange(3, 36);
const BREATH_CANVAS_SIZE = 640;
const BREATH_TEXTURE = createBreathTexture();

const MODE_PRESENTATION = {
  box: {
    title: '盒式呼吸法',
    purpose: '放松',
    art: 'petal-box.png'
  },
  fourSevenEight: {
    title: '长呼气',
    purpose: '睡眠',
    art: 'petal-sleep.png'
  },
  coherent: {
    title: '等量呼吸法',
    purpose: '专注',
    art: 'petal-focus.png',
    rhythmLabel: '5-0-5'
  },
  custom: {
    title: '自定义',
    purpose: '',
    art: 'petal-box.png'
  }
};

export function createMeditationApp(root, options = {}) {
  const app = createMeditationState({
    ...options,
    cuePlayer: createCuePlayer({ enabled: options.audioEnabled ?? true })
  });
  let timer = 0;
  let breathFrame = 0;
  const wheelTimers = new WeakMap();
  let activeDurationMethodId = '';
  const breathTimeline = {
    key: '',
    kind: 'ready',
    startedAt: 0,
    durationMs: 4200,
    running: false,
    loop: true,
    frozenProgress: 0,
    transitionFrom: null,
    transitionStartedAt: 0,
    transitionMs: 260
  };

  function render() {
    window.clearTimeout(timer);
    window.cancelAnimationFrame(breathFrame);
    const snapshot = app.getSnapshot();
    if (snapshot.view !== 'modeSelection') activeDurationMethodId = '';
    const screenClass = [
      snapshot.view === 'focus' ? 'focus-screen' : '',
      snapshot.view === 'custom' ? 'custom-screen' : '',
      snapshot.page === 'meditation' && snapshot.view === 'modeSelection' ? 'training-screen' : '',
      snapshot.page === 'records' ? 'records-screen' : '',
      snapshot.page === 'guide' ? 'guide-screen' : ''
    ].filter(Boolean).join(' ');
    root.innerHTML = `
      <section class="app-frame" data-od-id="app-frame">
        <div class="phone-shell" data-od-id="phone-shell">
          <div class="screen ${screenClass}" data-od-id="app-screen">
            ${renderCurrentView(snapshot)}
          </div>
        </div>
      </section>
    `;
    bindEvents();
    setupBreathRenderer(snapshot);

    if (snapshot.status === 'running') {
      scheduleFocusTick();
    }
  }

  function scheduleFocusTick() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const snapshot = app.sync();
      if (snapshot.view !== 'focus' || snapshot.status !== 'running') {
        render();
        return;
      }
      updateFocusDynamics(snapshot);
      scheduleFocusTick();
    }, 120);
  }

  function renderCurrentView(snapshot) {
    if (snapshot.view === 'focus') return renderFocus(snapshot);
    if (snapshot.view === 'custom') return renderCustomSetup(snapshot);
    if (snapshot.view === 'guide') return renderGuide(snapshot);
    if (snapshot.page !== 'records') {
      return `
        <header class="training-header" data-od-id="training-header">
          <button class="icon-button" data-page="meditation" aria-label="返回呼吸训练首页">
            <img src="${STYLE_ASSET_PATH}/icon-back.png" alt="" aria-hidden="true" />
          </button>
          <h1>呼吸训练</h1>
          <button class="icon-button info-button" data-action="open-guide" aria-label="了解呼吸训练和冥想">
            <img src="${STYLE_ASSET_PATH}/icon-info.png" alt="" aria-hidden="true" />
          </button>
        </header>
        <section class="training-intro" data-od-id="training-intro">
          <h2>选择要进行的呼吸训练。</h2>
        </section>
        ${renderModeSelection(snapshot)}
        ${renderNav(snapshot.page, snapshot.pages)}
      `;
    }
    return `
      <div class="top-line" data-od-id="top-line">
        <span>${snapshot.page === 'records' ? '练习记录' : '下午好，先慢下来'}</span>
        <span class="stat-chip">${snapshot.stats.currentStreak} 天连续</span>
      </div>
      ${snapshot.page === 'records' ? renderRecords(snapshot) : renderModeSelection(snapshot)}
      ${renderNav(snapshot.page, snapshot.pages)}
    `;
  }

  function renderModeSelection(snapshot) {
    return `
      <section class="list-view meditation-home" data-od-id="mode-selection">
        <div class="mode-grid" data-od-id="mode-grid">
        ${snapshot.availableModes.map((method) => {
          const presentation = getModePresentation(method);
          const durationPopoverOpen = activeDurationMethodId === method.id;
          return `
          <article data-action="select-mode" data-method="${method.id}" class="method-card ${method.category}${durationPopoverOpen ? ' duration-open' : ''}" role="button" tabindex="0" data-od-id="mode-card-${modeOdId(method.id)}">
            <img class="mode-blossom" src="${STYLE_ASSET_PATH}/${presentation.art}" alt="" aria-hidden="true" />
            <span class="mode-copy">
              <strong>${presentation.title}</strong>
              <small>${presentation.rhythmLabel}</small>
              ${presentation.purpose ? `<em>${presentation.purpose}</em>` : ''}
            </span>
            <span class="mode-meta">
              <button type="button" class="duration-chip" data-action="open-duration-menu" data-method="${method.id}" aria-expanded="${durationPopoverOpen}" aria-label="快速更改${presentation.title}时长">
                ${method.defaultMinutes} 分钟
              </button>
              ${method.id === 'custom' ? `
                <button type="button" class="mode-gear-button" data-action="select-mode" data-method="${method.id}" aria-label="设置自定义呼吸方式">
                  <img class="mode-gear" src="${STYLE_ASSET_PATH}/icon-gear.png" alt="" aria-hidden="true" />
                </button>
              ` : ''}
            </span>
            ${durationPopoverOpen ? renderDurationPopover(method, presentation) : ''}
          </article>
        `;
        }).join('')}
      </div>
        ${snapshot.beforeCardVisible ? `
        <article class="before-card" data-action="open-guide" role="button" tabindex="0" aria-label="了解呼吸训练和冥想" data-od-id="before-card">
          <button class="before-card-close" data-action="dismiss-before-card" aria-label="关闭开始前提示">×</button>
          <span>
            <strong>在您开始前</strong>
            <small>了解每项呼吸训练的工作原理并获取帮助您练习的提示。</small>
          </span>
          <img src="${STYLE_ASSET_PATH}/dandelion-card.png" alt="" aria-hidden="true" />
        </article>
        ` : ''}
      </section>
    `;
  }

  function renderDurationPopover(method, presentation) {
    return `
      <div class="duration-popover" role="dialog" aria-label="${presentation.title}训练时长">
        <label class="duration-input-wrap">
          <input
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            value="${method.defaultMinutes}"
            data-duration-input
            data-method="${method.id}"
            data-current-minutes="${method.defaultMinutes}"
            aria-label="输入训练分钟数"
            title="滚动调整分钟数"
          />
          <span>分钟</span>
        </label>
      </div>
    `;
  }

  function renderGuide() {
    return `
      <section class="guide-view" aria-label="呼吸训练与冥想科普" data-od-id="guide-view">
        <header class="training-header guide-header" data-od-id="guide-header">
          <button class="icon-button" data-action="guide-back" aria-label="返回呼吸训练首页">
            <img src="${STYLE_ASSET_PATH}/icon-back.png" alt="" aria-hidden="true" />
          </button>
          <h1>练习指南</h1>
          <span class="guide-header-spacer" aria-hidden="true"></span>
        </header>
        <div class="guide-copy" data-od-id="guide-copy">
          <p class="guide-kicker">开始前读一小段就好</p>
          <h2>呼吸训练让注意力有一个温柔的落点。</h2>
          <div class="guide-panel">
            <h3>它为什么有用</h3>
            <p>有节奏地吸气、停留和呼气，会让身体从紧绷里慢慢退出来。你不需要“清空大脑”，只要一次次回到下一次呼吸。</p>
          </div>
          <div class="guide-list" data-od-id="guide-list">
            <article>
              <strong>盒式呼吸法</strong>
              <span>适合紧张或思绪很多的时候，用均匀节奏稳定自己。</span>
            </article>
            <article>
              <strong>长呼气</strong>
              <span>呼气更长，适合睡前或需要慢慢降速的时刻。</span>
            </article>
            <article>
              <strong>等量呼吸法</strong>
              <span>吸气和呼气等长，适合工作间隙重新找回专注。</span>
            </article>
            <article>
              <strong>自定义</strong>
              <span>按自己的舒适区调整节奏；任何不舒服都可以缩短停留。</span>
            </article>
          </div>
        </div>
      </section>
    `;
  }

  function renderFocus(snapshot) {
    if (snapshot.status === 'idle') {
      return `
        <section class="focus-view focus-session focus-idle" aria-label="${snapshot.method.title}" data-od-id="focus-start-view">
          <button class="back-button" data-action="focus-back" data-od-id="focus-back">返回</button>
          <button class="focus-sound-button ${snapshot.soundEnabled ? '' : 'is-muted'}" data-action="focus-sound" aria-label="${snapshot.soundEnabled ? '关闭声音' : '打开声音'}">
            <img src="${STYLE_ASSET_PATH}/${snapshot.soundEnabled ? 'icon-sound-on.svg' : 'icon-sound-off.svg'}" alt="" aria-hidden="true" />
          </button>
          <div class="focus-phase-readout" data-od-id="focus-title">
            <strong>准备</strong>
            <span>${snapshot.method.rhythmLabel}</span>
          </div>
          <div class="focus-stage breath-ready" data-od-id="breath-stage">
            ${renderBreathVisual('ready')}
          </div>
          <div class="focus-timer" data-od-id="focus-duration">
            <strong>${snapshot.focusDurationLabel}</strong>
            <span>${snapshot.method.title}</span>
          </div>
          <button class="focus-start" data-action="focus-start" data-od-id="focus-start">开始</button>
        </section>
      `;
    }

    const primaryAction = snapshot.status === 'running' ? 'focus-pause' : 'focus-resume';
    const primaryLabel = snapshot.status === 'running' ? '暂停' : '继续';
    const isComplete = snapshot.status === 'completed';
    const phaseCountLabel = isComplete ? '' : `${snapshot.phase.remainingInPhase}`;
    return `
      <section class="focus-view focus-session focus-active status-${snapshot.status}" aria-label="${snapshot.method.title}" data-od-id="focus-running-view">
        <button class="focus-sound-button ${snapshot.soundEnabled ? '' : 'is-muted'}" data-action="focus-sound" aria-label="${snapshot.soundEnabled ? '关闭声音' : '打开声音'}">
          <img src="${STYLE_ASSET_PATH}/${snapshot.soundEnabled ? 'icon-sound-on.svg' : 'icon-sound-off.svg'}" alt="" aria-hidden="true" />
        </button>
        <div class="focus-phase-readout" aria-live="polite" data-od-id="focus-phase-readout">
          <strong data-focus-phase-label>${isComplete ? '完成' : snapshot.phase.label}</strong>
          <span data-focus-phase-count ${phaseCountLabel ? '' : 'hidden'}>${phaseCountLabel}</span>
        </div>
        <div class="focus-stage breath-${snapshot.phase.kind}" data-od-id="breath-stage">
          ${renderBreathVisual(snapshot.phase.kind)}
        </div>
        <div class="focus-timer">
          <strong data-focus-timer>${isComplete ? '完成' : secondsToLabel(snapshot.remainingInSession)}</strong>
          <span>${snapshot.method.title}</span>
        </div>
        <div class="focus-actions" data-od-id="focus-actions">
          ${isComplete ? '<button class="primary-action" data-action="focus-resume">再来一次</button>' : `<button class="primary-action" data-action="${primaryAction}">${primaryLabel}</button>`}
          <button class="end-action" data-action="focus-end">结束训练</button>
        </div>
      </section>
    `;
  }

  function renderBreathVisual(kind) {
    return `
      <div class="breath-visual visual-${kind}" data-od-id="breath-visual">
        <canvas class="breath-canvas" width="${BREATH_CANVAS_SIZE}" height="${BREATH_CANVAS_SIZE}" data-breath-canvas aria-hidden="true"></canvas>
      </div>
    `;
  }

  function setupBreathRenderer(snapshot) {
    const canvas = root.querySelector('[data-breath-canvas]');
    if (!canvas) return;
    syncBreathTimeline(snapshot, { force: true });
    drawBreathCanvas(canvas, breathTimeline, window.performance.now());
    const renderFrame = (now) => {
      const activeCanvas = root.querySelector('[data-breath-canvas]');
      if (!activeCanvas) return;
      drawBreathCanvas(activeCanvas, breathTimeline, now);
      if (breathTimeline.running || breathTimeline.loop) {
        breathFrame = window.requestAnimationFrame(renderFrame);
      }
    };
    breathFrame = window.requestAnimationFrame(renderFrame);
  }

  function updateFocusDynamics(snapshot) {
    const section = root.querySelector('.focus-active');
    const stage = root.querySelector('.focus-stage');
    const phaseLabel = root.querySelector('[data-focus-phase-label]');
    const phaseCount = root.querySelector('[data-focus-phase-count]');
    const timerLabel = root.querySelector('[data-focus-timer]');

    if (section) {
      section.className = `focus-view focus-session focus-active status-${snapshot.status}`;
    }
    if (stage) {
      stage.className = `focus-stage breath-${snapshot.phase.kind}`;
    }
    if (phaseLabel) {
      phaseLabel.textContent = snapshot.phase.label;
    }
    if (phaseCount) {
      phaseCount.textContent = `${snapshot.phase.remainingInPhase}`;
      phaseCount.hidden = snapshot.phase.isComplete;
    }
    if (timerLabel) {
      timerLabel.textContent = secondsToLabel(snapshot.remainingInSession);
    }

    syncBreathTimeline(snapshot);
  }

  function syncBreathTimeline(snapshot, options = {}) {
    const now = window.performance.now();
    const isIdle = snapshot.view === 'focus' && snapshot.status === 'idle';
    const isComplete = snapshot.phase?.kind === 'complete';
    const kind = isIdle ? 'ready' : getBreathVisualKind(snapshot);
    const durationMs = isIdle ? 4600 : getPhaseDurationMs(snapshot);
    const phaseProgress = isIdle || isComplete ? 0 : Math.max(0, Math.min(1, snapshot.phase.phaseProgress ?? 0));
    const phaseElapsedSeconds = Math.floor(phaseProgress * (durationMs / 1000));
    const phaseStartSecond = isIdle ? 0 : Math.max(0, snapshot.phase.elapsedSeconds - phaseElapsedSeconds);
    const key = isIdle ? `ready:${snapshot.method.id}` : `${snapshot.method.id}:${snapshot.phase.phaseIndex}:${phaseStartSecond}:${kind}`;

    if (options.force || breathTimeline.key !== key) {
      const previousMotion = breathTimeline.key && !options.force
        ? getBreathMotion(breathTimeline.kind, getTimelineProgress(breathTimeline, now), now)
        : null;
      breathTimeline.key = key;
      breathTimeline.kind = kind;
      breathTimeline.startedAt = now - phaseProgress * durationMs;
      breathTimeline.durationMs = durationMs;
      breathTimeline.frozenProgress = phaseProgress;
      breathTimeline.transitionFrom = previousMotion;
      breathTimeline.transitionStartedAt = now;
    }

    breathTimeline.running = snapshot.status === 'running';
    breathTimeline.loop = isIdle || isComplete;
    if (!breathTimeline.running && !breathTimeline.loop) {
      breathTimeline.frozenProgress = phaseProgress;
    }
  }

  function getPhaseDurationMs(snapshot) {
    const phase = snapshot.method.phases[snapshot.phase.phaseIndex];
    return Math.max(1000, (phase?.durationSeconds ?? 4) * 1000);
  }

  function getBreathVisualKind(snapshot) {
    if (snapshot.phase.kind !== 'hold') return snapshot.phase.kind;
    const phases = snapshot.method.phases;
    const previousPhase = phases[(snapshot.phase.phaseIndex - 1 + phases.length) % phases.length];
    return previousPhase?.kind === 'exhale' ? 'hold-empty' : 'hold-full';
  }

  function renderCustomSetup(snapshot) {
    const settings = snapshot.customSettings;
    const cycleSeconds = settings.inhale + settings.hold + settings.exhale;
    return `
      <section class="custom-view custom-settings-view" aria-label="设置呼吸方式" data-od-id="custom-view">
        <header class="custom-settings-header" data-od-id="custom-settings-header">
          <button class="custom-nav-back" data-action="custom-back" aria-label="返回呼吸训练首页" data-od-id="custom-back">
            <img src="${STYLE_ASSET_PATH}/icon-back.png" alt="" aria-hidden="true" />
          </button>
          <h1 class="custom-title">设置呼吸方式</h1>
        </header>
        <div class="custom-picker-panel" data-od-id="custom-panel">
          <div class="custom-cycle-row" data-od-id="custom-cycle-row">
            <strong>每个周期的时间</strong>
            ${renderScrollWheel({
              type: 'cycle',
              values: CYCLE_SECOND_OPTIONS,
              value: cycleSeconds,
              unit: '秒',
              className: 'custom-cycle-total inline-scroll-wheel',
              ariaLabel: '设置每个周期的时间'
            })}
          </div>
          <div class="custom-wheel-grid" aria-label="每个周期的时间" data-od-id="custom-wheel-grid">
            ${renderCustomWheel('inhale', '吸气', settings.inhale)}
            ${renderCustomWheel('hold', '保持', settings.hold)}
            ${renderCustomWheel('exhale', '呼气', settings.exhale)}
          </div>
          <div class="custom-panel-divider" aria-hidden="true"></div>
          <div class="custom-target-row" data-od-id="custom-target-row">
            <span>呼吸目标时间</span>
            ${renderScrollWheel({
              type: 'duration',
              values: DURATIONS_MINUTES,
              value: settings.durationMinutes,
              unit: '分钟',
              className: 'custom-duration-total inline-scroll-wheel',
              ariaLabel: '设置呼吸目标时间'
            })}
          </div>
        </div>
      </section>
    `;
  }

  function renderCustomWheel(kind, label, value) {
    return `
      <div class="custom-wheel" data-od-id="custom-wheel-${kind}">
        <span class="custom-wheel-label">${label}</span>
        ${renderScrollWheel({
          type: 'phase',
          kind,
          values: PHASE_SECOND_OPTIONS,
          value,
          className: 'phase-scroll-wheel',
          ariaLabel: `设置${label}秒数`
        })}
      </div>
    `;
  }

  function renderScrollWheel({ type, kind = '', values, value, unit = '', className = '', ariaLabel }) {
    const valueOptions = values.map((item) => `
      <button type="button" class="scroll-wheel-option ${item === value ? 'is-selected' : ''}" data-wheel-value="${item}" aria-label="${unit ? `${item} ${unit}` : item}">
        <span class="scroll-wheel-number">${item}</span>${unit ? `<span class="scroll-wheel-unit">${unit}</span>` : ''}
      </button>
    `).join('');
    return `
      <div class="custom-scroll-wheel ${className}" data-scroll-wheel="${type}" ${kind ? `data-custom-kind="${kind}"` : ''} data-current="${value}" tabindex="0" role="spinbutton" aria-label="${ariaLabel}" aria-valuenow="${value}" aria-valuemin="${values[0]}" aria-valuemax="${values[values.length - 1]}">
        <span class="scroll-wheel-spacer" aria-hidden="true"></span>
        ${valueOptions}
        <span class="scroll-wheel-spacer" aria-hidden="true"></span>
      </div>
    `;
  }

  function renderRecords(snapshot) {
    return `
      <section class="list-view records-view" data-od-id="records-view">
        <div class="records-hero">
          <div class="headline compact">
            <span>练习记录</span>
            <h1>轻轻记住坚持</h1>
          </div>
          <div class="records-total">
            <strong>${snapshot.stats.completedDurationLabel}</strong>
            <span>累计时长</span>
          </div>
        </div>
        <div class="stats-grid" data-od-id="records-stats">
          <div class="stat-card"><strong>${snapshot.stats.currentStreak}</strong><span>连续天数</span></div>
          <div class="stat-card"><strong>${snapshot.stats.weeklyDurationLabel}</strong><span>本周时长</span></div>
          <div class="stat-card"><strong>${snapshot.stats.totalSessions}</strong><span>完成次数</span></div>
        </div>
        ${renderHeatCalendar(snapshot.stats.calendarDays)}
        <div class="records-list" data-od-id="records-list">
          ${snapshot.stats.recentRecords.map((record) => `
            <div class="record-row">
              <span class="record-mark" aria-hidden="true"></span>
              <span class="record-copy">
                <strong>${record.methodTitle}</strong>
                <small>${formatRecordDate(record.completedAt)}</small>
              </span>
              <span class="record-minutes">${formatRecordDuration(record)}</span>
            </div>
          `).join('') || '<p class="empty">完成一次练习后会出现在这里</p>'}
        </div>
      </section>
    `;
  }

  function renderHeatCalendar(days = []) {
    const practicedDays = days.filter((day) => day.minutes > 0).length;
    const bestDay = days.reduce((best, day) => day.minutes > best.minutes ? day : best, { minutes: 0, label: '暂无' });
    return `
      <section class="heatmap-card" aria-label="练习热力日历" data-od-id="records-heatmap">
        <div class="heatmap-header">
          <span>
            <strong>热力日历</strong>
            <small>近 28 天</small>
          </span>
          <em>${practicedDays} 天练习</em>
        </div>
        <div class="heatmap-weekdays" aria-hidden="true">
          <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
        </div>
        <div class="heatmap-grid">
          ${days.map((day) => `
            <span
              class="heat-day level-${day.level}"
              title="${day.label}，${day.durationSeconds ? day.durationLabel : '未练习'}"
              aria-label="${day.label}，${day.durationSeconds ? `${day.durationLabel}，${day.sessions} 次` : '未练习'}"
            >${day.day}</span>
          `).join('')}
        </div>
        <div class="heatmap-footer">
          <span>最长一格</span>
          <strong>${bestDay.durationSeconds ? `${bestDay.label} · ${bestDay.durationLabel}` : '从今天开始'}</strong>
        </div>
      </section>
    `;
  }

  function formatRecordDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '刚刚完成';
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function formatRecordDuration(record) {
    if (record.durationLabel) return record.durationLabel;
    const durationSeconds = Number(record.durationSeconds);
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      if (durationSeconds < 60) return `${Math.floor(durationSeconds)} 秒`;
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = Math.floor(durationSeconds % 60);
      return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
    }
    return `${record.minutes} 分钟`;
  }

  function renderNav(activePage, pages) {
    return `
      <nav class="bottom-nav" aria-label="主导航" data-od-id="bottom-nav">
        ${pages.map((page) => navButton(page.id, page.label, activePage)).join('')}
      </nav>
    `;
  }

  function navButton(page, label, activePage) {
    return `<button data-page="${page}" class="${activePage === page ? 'active' : ''}"><span>${label}</span></button>`;
  }

  function getModePresentation(method) {
    const presentation = MODE_PRESENTATION[method.id] ?? {};
    return {
      title: presentation.title ?? method.title,
      purpose: presentation.purpose ?? method.subtitle,
      art: presentation.art ?? 'petal-box.png',
      rhythmLabel: presentation.rhythmLabel ?? method.rhythmLabel
    };
  }

  function modeOdId(id) {
    return id.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  function bindEvents() {
    root.querySelector('[data-action="focus-start"]')?.addEventListener('click', () => {
      app.start();
      render();
    });
    root.querySelector('[data-action="focus-resume"]')?.addEventListener('click', () => {
      app.start();
      render();
    });
    root.querySelector('[data-action="focus-pause"]')?.addEventListener('click', () => {
      app.pause();
      render();
    });
    root.querySelector('[data-action="focus-sound"]')?.addEventListener('click', () => {
      app.toggleSound();
      render();
    });
    root.querySelector('[data-action="focus-end"]')?.addEventListener('click', () => {
      app.endSession();
      render();
    });
    root.querySelector('[data-action="focus-back"]')?.addEventListener('click', () => {
      app.backToModes();
      render();
    });
    root.querySelector('[data-action="custom-back"]')?.addEventListener('click', () => {
      app.backToModes();
      render();
    });
    root.querySelector('[data-action="custom-start"]')?.addEventListener('click', () => {
      app.startCustomSession();
      render();
    });
    root.querySelectorAll('[data-action="open-guide"]').forEach((button) => button.addEventListener('click', () => {
      app.openGuide();
      render();
    }));
    root.querySelector('[data-action="open-guide"][role="button"]')?.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      app.openGuide();
      render();
    });
    root.querySelector('[data-action="guide-back"]')?.addEventListener('click', () => {
      app.backToModes();
      render();
    });
    root.querySelector('[data-action="dismiss-before-card"]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      app.dismissBeforeCard();
      render();
    });
    root.querySelectorAll('[data-action="custom-step"]').forEach((button) => button.addEventListener('click', () => {
      const snapshot = app.getSnapshot();
      const kind = button.dataset.customKind;
      const nextValue = snapshot.customSettings[kind] + Number(button.dataset.delta);
      app.setCustomPhase(kind, nextValue);
      render();
    }));
    root.querySelectorAll('[data-custom-duration]').forEach((button) => button.addEventListener('click', () => {
      app.setCustomDuration(Number(button.dataset.customDuration));
      render();
    }));
    bindScrollWheels();
    root.querySelectorAll('[data-action="open-duration-menu"]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      activeDurationMethodId = activeDurationMethodId === button.dataset.method ? '' : button.dataset.method;
      render();
      if (activeDurationMethodId) focusDurationInput(activeDurationMethodId);
    }));
    root.querySelectorAll('.duration-popover').forEach((popover) => popover.addEventListener('click', (event) => {
      event.stopPropagation();
    }));
    bindDurationInputs();
    root.querySelectorAll('[data-action="select-mode"]').forEach((control) => control.addEventListener('click', (event) => {
      if (control.tagName === 'BUTTON') event.stopPropagation();
      activeDurationMethodId = '';
      app.selectMode(control.dataset.method);
      render();
    }));
    root.querySelectorAll('.method-card[role="button"]').forEach((card) => card.addEventListener('keydown', (event) => {
      if (event.target !== card || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      activeDurationMethodId = '';
      app.selectMode(card.dataset.method);
      render();
    }));
    root.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => {
      app.setPage(button.dataset.page);
      render();
    }));
  }

  function bindDurationInputs() {
    root.querySelectorAll('[data-duration-input]').forEach((input) => {
      input.addEventListener('input', () => {
        if (input.value === '') return;
        commitDurationInput(input);
      });
      input.addEventListener('blur', () => commitDurationInput(input));
      input.addEventListener('keydown', (event) => {
        if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          adjustDurationInput(input, event.key === 'ArrowUp' ? 1 : -1);
          return;
        }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        commitDurationInput(input, { close: true });
      });
      input.addEventListener('wheel', (event) => {
        event.preventDefault();
        event.stopPropagation();
        adjustDurationInput(input, event.deltaY < 0 ? 1 : -1);
      }, { passive: false });
    });
  }

  function adjustDurationInput(input, delta) {
    const currentMinutes = Number(input.value) || Number(input.dataset.currentMinutes) || 1;
    input.value = String(Math.max(1, Math.round(currentMinutes + delta)));
    commitDurationInput(input);
  }

  function commitDurationInput(input, options = {}) {
    const fallback = Number(input.dataset.currentMinutes) || 1;
    const nextMinutes = Math.max(1, Math.round(Number(input.value) || fallback));
    input.value = String(nextMinutes);
    input.dataset.currentMinutes = String(nextMinutes);
    app.setModeDuration(input.dataset.method, nextMinutes);
    const chip = root.querySelector(`.duration-chip[data-method="${input.dataset.method}"]`);
    if (chip) chip.textContent = `${nextMinutes} 分钟`;
    if (options.close) {
      activeDurationMethodId = '';
      render();
    }
  }

  function focusDurationInput(methodId) {
    window.setTimeout(() => {
      const input = root.querySelector(`[data-duration-input][data-method="${methodId}"]`);
      input?.focus();
      input?.select();
    }, 0);
  }

  function bindScrollWheels() {
    root.querySelectorAll('[data-scroll-wheel]').forEach((wheel) => {
      centerWheelOnValue(wheel);
      wheel.addEventListener('scroll', () => {
        if (wheel.dataset.programmaticScroll === 'true') return;
        window.clearTimeout(wheelTimers.get(wheel));
        wheelTimers.set(wheel, window.setTimeout(() => {
          commitWheelValue(wheel, getCenteredWheelValue(wheel));
        }, 110));
      });
      wheel.addEventListener('click', (event) => {
        const option = event.target.closest('[data-wheel-value]');
        if (!option || !wheel.contains(option)) return;
        commitWheelValue(wheel, Number(option.dataset.wheelValue));
      });
      wheel.addEventListener('keydown', (event) => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const values = getWheelValues(wheel);
        const current = getCenteredWheelValue(wheel) ?? Number(wheel.dataset.current);
        const index = values.indexOf(current);
        const nextIndex = Math.max(0, Math.min(values.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        commitWheelValue(wheel, values[nextIndex]);
      });
    });
  }

  function centerWheelOnValue(wheel) {
    const value = Number(wheel.dataset.current);
    const option = wheel.querySelector(`[data-wheel-value="${value}"]`);
    if (!option) return;
    wheel.dataset.programmaticScroll = 'true';
    wheel.scrollTop = option.offsetTop - ((wheel.clientHeight - option.offsetHeight) / 2);
    window.requestAnimationFrame(() => {
      delete wheel.dataset.programmaticScroll;
    });
  }

  function getCenteredWheelValue(wheel) {
    const center = wheel.scrollTop + (wheel.clientHeight / 2);
    let bestOption = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    wheel.querySelectorAll('[data-wheel-value]').forEach((option) => {
      const optionCenter = option.offsetTop + (option.offsetHeight / 2);
      const distance = Math.abs(center - optionCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestOption = option;
      }
    });
    return bestOption ? Number(bestOption.dataset.wheelValue) : null;
  }

  function getWheelValues(wheel) {
    return [...wheel.querySelectorAll('[data-wheel-value]')].map((option) => Number(option.dataset.wheelValue));
  }

  function commitWheelValue(wheel, value) {
    if (!Number.isFinite(value) || value === Number(wheel.dataset.current)) {
      centerWheelOnValue(wheel);
      return;
    }
    if (wheel.dataset.scrollWheel === 'phase') {
      app.setCustomPhase(wheel.dataset.customKind, value);
    } else if (wheel.dataset.scrollWheel === 'cycle') {
      app.setCustomCycleTotal(value);
    } else if (wheel.dataset.scrollWheel === 'duration') {
      app.setCustomDuration(value);
    }
    render();
  }

  render();
  return {
    destroy() {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(breathFrame);
    }
  };
}

function createNumberRange(min, max) {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function createBreathTexture() {
  return Array.from({ length: 42 }, (_, index) => ({
    angle: index * 1.618,
    distance: 0.08 + ((index * 37) % 100) / 100 * 0.82,
    size: 4 + ((index * 19) % 34),
    alpha: 0.015 + ((index * 23) % 100) / 100 * 0.04,
    drift: 0.4 + ((index * 29) % 100) / 100 * 1.2
  }));
}

function drawBreathCanvas(canvas, timeline, now) {
  const context = canvas.getContext('2d');
  if (!context) return;

  const box = canvas.getBoundingClientRect();
  const cssSize = Math.max(1, Math.round(Math.min(box.width || BREATH_CANVAS_SIZE, box.height || BREATH_CANVAS_SIZE)));
  const dpr = Math.min(2.5, canvas.ownerDocument.defaultView.devicePixelRatio || 1);
  const pixelSize = Math.round(cssSize * dpr);
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize;
    canvas.height = pixelSize;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssSize, cssSize);

  const progress = getTimelineProgress(timeline, now);
  let motion = getBreathMotion(timeline.kind, progress, now);
  if (timeline.transitionFrom) {
    const transitionProgress = clamp01((now - timeline.transitionStartedAt) / timeline.transitionMs);
    if (transitionProgress < 1) {
      motion = mixBreathMotion(timeline.transitionFrom, motion, easeOutCubic(transitionProgress));
    }
  }
  const center = cssSize / 2;
  const radius = cssSize * 0.32 * motion.scale;
  const time = now / 1000;

  context.save();
  context.translate(center, center + motion.lift);
  context.rotate(motion.rotate);

  drawBreathGlow(context, radius, motion, time);
  drawBreathHalo(context, radius, motion, time);
  drawBreathVeil(context, radius, motion, time);
  drawBreathCore(context, radius, motion, time);
  drawBreathTexture(context, radius, motion, time);
  drawBreathCenter(context, radius, motion, time);

  context.restore();
}

function getTimelineProgress(timeline, now) {
  const rawProgress = timeline.loop
    ? ((now - timeline.startedAt) % timeline.durationMs) / timeline.durationMs
    : clamp01((now - timeline.startedAt) / timeline.durationMs);
  return timeline.running || timeline.loop ? rawProgress : timeline.frozenProgress;
}

function mixBreathMotion(from, to, amount) {
  return {
    scale: lerp(from.scale, to.scale, amount),
    bloom: lerp(from.bloom, to.bloom, amount),
    rotate: lerp(from.rotate, to.rotate, amount),
    lift: lerp(from.lift, to.lift, amount),
    orbit: lerp(from.orbit, to.orbit, amount)
  };
}

function getBreathMotion(kind, progress, now) {
  const wave = Math.sin(now / 820);
  const slowWave = Math.sin(now / 1450);
  if (kind === 'ready') {
    return {
      scale: 0.7,
      bloom: 0.54,
      rotate: -0.13,
      lift: 12,
      orbit: 0.24
    };
  }
  if (kind === 'inhale') {
    const t = easeInOutCubic(progress);
    const endpointGuard = Math.sin(progress * Math.PI);
    return {
      scale: lerp(0.7, 1.08, t) + wave * 0.006 * endpointGuard,
      bloom: lerp(0.54, 0.88, t),
      rotate: lerp(-0.13, 0.04, t) + slowWave * 0.014 * endpointGuard,
      lift: lerp(12, -4, t),
      orbit: lerp(0.24, 0.52, t)
    };
  }
  if (kind === 'hold-full') {
    const swell = Math.sin(progress * Math.PI);
    return {
      scale: 1.08 + swell * 0.018,
      bloom: 0.88 + swell * 0.02,
      rotate: 0.04 + slowWave * 0.024 * swell,
      lift: -4 + wave * 3.2 * swell,
      orbit: 0.52 + swell * 0.16
    };
  }
  if (kind === 'hold-empty') {
    const stillness = Math.sin(progress * Math.PI);
    return {
      scale: 0.7 + stillness * 0.014,
      bloom: 0.54 + stillness * 0.02,
      rotate: -0.13 + slowWave * 0.018 * stillness,
      lift: 12 + wave * 2 * stillness,
      orbit: 0.24 + stillness * 0.06
    };
  }
  if (kind === 'exhale') {
    const t = easeInOutCubic(progress);
    return {
      scale: lerp(1.08, 0.7, t) + wave * 0.004,
      bloom: lerp(0.88, 0.54, t),
      rotate: lerp(0.04, -0.13, t) + slowWave * 0.012 * Math.sin(progress * Math.PI),
      lift: lerp(-4, 12, t),
      orbit: lerp(0.52, 0.24, t)
    };
  }
  return {
    scale: 0.84 + Math.sin(progress * Math.PI * 2) * 0.018,
    bloom: 0.62,
    rotate: slowWave * 0.02,
    lift: 7 + wave * 1.8,
    orbit: 0.3
  };
}

function drawBreathGlow(context, radius, motion) {
  context.save();
  context.globalAlpha = 0.18 + motion.bloom * 0.14;
  context.filter = 'blur(22px)';
  const gradient = context.createRadialGradient(0, 0, radius * 0.12, 0, 0, radius * 1.58);
  gradient.addColorStop(0, 'rgba(159, 110, 238, 0.32)');
  gradient.addColorStop(0.5, 'rgba(183, 151, 245, 0.2)');
  gradient.addColorStop(1, 'rgba(173, 228, 230, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, radius * 1.62, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawBreathHalo(context, radius, motion, time) {
  context.save();
  context.globalAlpha = 0.28 + motion.bloom * 0.18;
  context.fillStyle = 'rgba(190, 164, 255, 0.26)';
  drawOrganicBlob(context, 0, 0, radius * 1.18, {
    points: 34,
    amp: 0.045,
    time: time * 0.26,
    seed: 0.4,
    scaleX: 1.02,
    scaleY: 0.98
  });
  context.fill();
  context.restore();
}

function drawBreathVeil(context, radius, motion, time) {
  context.save();
  context.rotate(-0.24 + Math.sin(time * 0.42) * 0.08);
  context.scale(1.32 + motion.orbit * 0.25, 0.54 + motion.orbit * 0.06);
  context.globalAlpha = 0.18 + motion.orbit * 0.32;
  const gradient = context.createLinearGradient(-radius, 0, radius, 0);
  gradient.addColorStop(0, 'rgba(203, 181, 255, 0.1)');
  gradient.addColorStop(0.46, 'rgba(162, 108, 238, 0.34)');
  gradient.addColorStop(1, 'rgba(184, 133, 246, 0.3)');
  context.fillStyle = gradient;
  drawOrganicBlob(context, 0, 0, radius * 0.92, {
    points: 30,
    amp: 0.09,
    time: time * 0.34,
    seed: 2.1,
    scaleX: 1.16,
    scaleY: 0.92
  });
  context.fill();
  context.restore();
}

function drawBreathCore(context, radius, motion, time) {
  context.save();
  context.globalAlpha = 0.64 + motion.bloom * 0.2;
  const gradient = context.createRadialGradient(-radius * 0.24, -radius * 0.32, radius * 0.06, 0, 0, radius * 1.18);
  gradient.addColorStop(0, 'rgba(236, 222, 255, 0.66)');
  gradient.addColorStop(0.18, 'rgba(190, 143, 246, 0.78)');
  gradient.addColorStop(0.62, 'rgba(158, 110, 239, 0.76)');
  gradient.addColorStop(1, 'rgba(135, 101, 219, 0.5)');
  context.fillStyle = gradient;
  drawOrganicBlob(context, 0, 0, radius, {
    points: 42,
    amp: 0.06 + motion.orbit * 0.03,
    time: time * 0.46,
    seed: 1.2,
    scaleX: 1.01,
    scaleY: 1.02
  });
  context.fill();

  context.globalAlpha = 0.18;
  context.fillStyle = 'rgba(255, 255, 255, 0.9)';
  drawOrganicBlob(context, -radius * 0.28, -radius * 0.25, radius * 0.34, {
    points: 24,
    amp: 0.16,
    time: time * 0.36,
    seed: 6.2,
    scaleX: 1.2,
    scaleY: 0.74
  });
  context.fill();
  context.restore();
}

function drawBreathTexture(context, radius, motion, time) {
  context.save();
  context.globalCompositeOperation = 'screen';
  BREATH_TEXTURE.forEach((particle) => {
    const driftAngle = particle.angle + Math.sin(time * particle.drift + particle.angle) * 0.16;
    const distance = radius * particle.distance * (0.42 + motion.scale * 0.5);
    const x = Math.cos(driftAngle) * distance;
    const y = Math.sin(driftAngle * 1.13) * distance * 0.88;
    const size = particle.size * (0.7 + motion.bloom * 0.55);
    const gradient = context.createRadialGradient(x, y, 0, x, y, size);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${particle.alpha * 1.8})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

function drawBreathCenter(context, radius, motion, time) {
  context.save();
  const pulse = 1 + Math.sin(time * 2.2) * 0.04;
  const centerRadius = radius * (0.115 + motion.bloom * 0.02) * pulse;
  context.globalAlpha = 0.32 + motion.bloom * 0.16;
  context.fillStyle = 'rgba(118, 84, 218, 0.42)';
  context.beginPath();
  context.arc(0, 0, centerRadius, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 0.16;
  context.beginPath();
  context.arc(0, 0, centerRadius * 1.72, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawOrganicBlob(context, cx, cy, radius, options) {
  const points = [];
  const count = options.points ?? 32;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const noise =
      Math.sin(angle * 3 + options.time + options.seed) * 0.55 +
      Math.sin(angle * 5 - options.time * 1.21 + options.seed * 1.7) * 0.32 +
      Math.sin(angle * 7 + options.time * 0.72 + options.seed * 0.8) * 0.13;
    const localRadius = radius * (1 + noise * options.amp);
    points.push({
      x: cx + Math.cos(angle) * localRadius * (options.scaleX ?? 1),
      y: cy + Math.sin(angle) * localRadius * (options.scaleY ?? 1)
    });
  }

  context.beginPath();
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const midX = (point.x + next.x) / 2;
    const midY = (point.y + next.y) / 2;
    if (index === 0) {
      context.moveTo(midX, midY);
    } else {
      context.quadraticCurveTo(point.x, point.y, midX, midY);
    }
  });
  context.closePath();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function easeInOutCubic(value) {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - ((1 - t) ** 3);
}
