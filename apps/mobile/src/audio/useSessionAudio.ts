import { useCallback, useMemo, useRef, useState } from 'react';
import { useAudioPlayer } from 'expo-audio';

import {
  createCuePlaybackController,
  type SessionCueKind
} from './cuePlaybackController';

const SESSION_AUDIO_UNAVAILABLE_NOTE =
  '提示音暂时不可用，本次练习将保持静音。';

export type UseSessionAudioOptions = {
  preferenceEnabled: boolean;
  setPreferenceEnabled(enabled: boolean): Promise<void>;
};

export type UseSessionAudioResult = {
  enabled: boolean;
  note: string | null;
  toggle(): Promise<void>;
  resetForReplay(): void;
  play(
    kind: SessionCueKind,
    cycleIndex?: number,
    phaseIndex?: number
  ): Promise<void>;
};

export function useSessionAudio({
  preferenceEnabled,
  setPreferenceEnabled
}: UseSessionAudioOptions): UseSessionAudioResult {
  const inhalePlayer = useAudioPlayer(
    require('../../assets/audio/inhale.wav')
  );
  const holdPlayer = useAudioPlayer(require('../../assets/audio/hold.wav'));
  const exhalePlayer = useAudioPlayer(
    require('../../assets/audio/exhale.wav')
  );
  const completePlayer = useAudioPlayer(
    require('../../assets/audio/complete.wav')
  );
  const controller = useMemo(
    () =>
      createCuePlaybackController({
        inhale: inhalePlayer,
        hold: holdPlayer,
        exhale: exhalePlayer,
        complete: completePlayer
      }),
    [completePlayer, exhalePlayer, holdPlayer, inhalePlayer]
  );
  const playedKeys = useRef(new Set<string>());
  const [sessionAvailable, setSessionAvailable] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const enabled = preferenceEnabled && sessionAvailable;

  const toggle = useCallback(async () => {
    await setPreferenceEnabled(!preferenceEnabled);
  }, [preferenceEnabled, setPreferenceEnabled]);

  const resetForReplay = useCallback(() => {
    playedKeys.current.clear();
    setSessionAvailable(true);
    setNote(null);
  }, []);

  const play = useCallback(
    async (
      kind: SessionCueKind,
      cycleIndex?: number,
      phaseIndex?: number
    ): Promise<void> => {
      if (!enabled) {
        return;
      }

      const key =
        kind === 'complete'
          ? 'complete'
          : cycleIndex !== undefined && phaseIndex !== undefined
            ? `${cycleIndex}:${phaseIndex}:${kind}`
            : null;
      if (key !== null) {
        if (playedKeys.current.has(key)) {
          return;
        }
        playedKeys.current.add(key);
      }

      if (!(await controller.play(kind))) {
        setSessionAvailable(false);
        setNote((current) => current ?? SESSION_AUDIO_UNAVAILABLE_NOTE);
      }
    },
    [controller, enabled]
  );

  return { enabled, note, toggle, resetForReplay, play };
}
