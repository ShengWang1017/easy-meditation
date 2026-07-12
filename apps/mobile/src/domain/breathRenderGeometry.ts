export const BREATH_BASE_RADIUS_FRACTION = 0.32;

export function resolveBreathingCanvasSize(width: number): number {
  const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
  return safeWidth <= 380
    ? Math.min(safeWidth * 0.86, 340)
    : Math.min(safeWidth * 0.78, 342);
}

export function resolveLogicalCoreRadius(
  canvasSize: number,
  scale: number
): number {
  return canvasSize * BREATH_BASE_RADIUS_FRACTION * scale;
}
