export type SessionCueKind = 'inhale' | 'hold' | 'exhale' | 'complete';

export type CuePlayerPort = {
  seekTo(seconds: number): Promise<void>;
  play(): void;
};

export type CuePlaybackController = {
  play(kind: SessionCueKind): Promise<boolean>;
};

export function createCuePlaybackController(
  players: Record<SessionCueKind, CuePlayerPort>
): CuePlaybackController {
  return {
    async play(kind) {
      try {
        const player = players[kind];
        await player.seekTo(0);
        player.play();
        return true;
      } catch {
        return false;
      }
    }
  };
}
