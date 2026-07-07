export function createCuePlayer({ enabled = true } = {}) {
  let context = null;
  let background = null;

  function getContext() {
    if (!enabled) return null;
    const AudioCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioCtor) return null;
    context ??= new AudioCtor();
    return context;
  }

  function unlock() {
    const audio = getContext();
    if (audio?.state === 'suspended') {
      void audio.resume();
    }
  }

  function startBackground() {
    const audio = getContext();
    if (!audio || background) return;

    const now = audio.currentTime;
    const master = audio.createGain();
    const low = audio.createOscillator();
    const high = audio.createOscillator();
    const lfo = audio.createOscillator();
    const lfoGain = audio.createGain();

    low.type = 'sine';
    high.type = 'triangle';
    lfo.type = 'sine';

    low.frequency.setValueAtTime(196, now);
    high.frequency.setValueAtTime(293.66, now);
    lfo.frequency.setValueAtTime(0.055, now);
    lfoGain.gain.setValueAtTime(0.012, now);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.035, now + 1.2);

    lfo.connect(lfoGain).connect(master.gain);
    low.connect(master);
    high.connect(master);
    master.connect(audio.destination);

    low.start(now);
    high.start(now);
    lfo.start(now);

    background = { low, high, lfo, master };
  }

  function pauseBackground() {
    stopBackground(0.45);
  }

  function stopBackground(fadeSeconds = 0.8) {
    if (!background || !context) return;

    const current = background;
    const now = context.currentTime;
    current.master.gain.cancelScheduledValues(now);
    current.master.gain.setValueAtTime(Math.max(current.master.gain.value, 0.0001), now);
    current.master.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
    current.low.stop(now + fadeSeconds + 0.02);
    current.high.stop(now + fadeSeconds + 0.02);
    current.lfo.stop(now + fadeSeconds + 0.02);
    background = null;
  }

  function play(kind) {
    const audio = getContext();
    if (!audio) return;

    const now = audio.currentTime;
    const gain = audio.createGain();
    const oscillator = audio.createOscillator();
    const { from, to, duration } = cueShape(kind);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  return { unlock, startBackground, pauseBackground, stopBackground, play };
}

function cueShape(kind) {
  if (kind === 'inhale') return { from: 392, to: 587, duration: 0.42 };
  if (kind === 'hold') return { from: 523, to: 523, duration: 0.32 };
  if (kind === 'exhale') return { from: 440, to: 294, duration: 0.5 };
  if (kind === 'complete') return { from: 440, to: 660, duration: 0.68 };
  return { from: 392, to: 392, duration: 0.26 };
}
