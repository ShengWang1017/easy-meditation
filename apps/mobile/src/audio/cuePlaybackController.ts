export type SessionCueKind = 'inhale' | 'hold' | 'exhale' | 'complete';

export type CuePlayerPort = {
  seekTo(seconds: number): Promise<void>;
  play(): void;
};

export type CuePlaybackController = {
  play(kind: SessionCueKind, guard?: () => boolean): Promise<boolean>;
};

export function createCuePlaybackController(
  players: Record<SessionCueKind, CuePlayerPort>
): CuePlaybackController {
  return {
    async play(kind, guard = () => true) {
      try {
        const player = players[kind];
        await player.seekTo(0);
        if (!guard()) return false;
        player.play();
        return true;
      } catch {
        return false;
      }
    }
  };
}
