export const colors = {
  backgroundTop: '#f0f2ff',
  backgroundMid: '#e8fbfa',
  backgroundBottom: '#f7f8fa',
  surface: 'rgba(255, 255, 255, 0.82)',
  surfaceStrong: '#ffffff',
  ink: '#111622',
  muted: '#69717f',
  accent: '#49736f',
  accentStrong: '#245e59',
  danger: '#a64242',
  lilac: '#dfe0f8',
  mint: '#dff2ea',
  blue: '#d7eef7',
  tabBorder: '#d4ddd9'
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32
} as const;

export const radii = {
  sm: 14,
  md: 18,
  lg: 24,
  xl: 34,
  pill: 999
} as const;

// Optional decorative display font (楷体 / hand-lettered). Loaded at runtime via
// expo-font in the root layout; falls back to the system font when unavailable so
// text always renders. Kept here so every screen reads the family from one place.
export const fonts = {
  display: undefined as string | undefined,
  body: undefined as string | undefined
} as const;

export const type = {
  hero: { fontSize: 40, fontWeight: '700' as const, lineHeight: 46 },
  title: { fontSize: 32, fontWeight: '700' as const, lineHeight: 38 },
  section: { fontSize: 20, fontWeight: '700' as const, lineHeight: 26 },
  cardTitle: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  label: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  meta: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 }
} as const;

// Three-stop pastel wash used as the app-wide background (periwinkle → mint → white).
export const gradientColors = [
  colors.backgroundTop,
  colors.backgroundMid,
  colors.backgroundBottom
] as const;

// Soft floating-card shadow (approximates the prototype's glassmorphic depth).
export const shadowSoft = {
  shadowColor: '#4a4a70',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.12,
  shadowRadius: 20,
  elevation: 4
} as const;

// Per-method visual identity mirroring the web prototype's pastel cards.
// bg = card fill, border = subtle rim, glow = orb tint, mood = tag copy.
export type MethodTint = {
  bg: string;
  border: string;
  glow: string;
  mood: string;
};

export const methodTints: Record<string, MethodTint> = {
  box: { bg: '#f3e6f1', border: 'rgba(196, 156, 192, 0.45)', glow: '#e7c7e4', mood: '放松' },
  'four-seven-eight': {
    bg: '#e7e4f8',
    border: 'rgba(160, 150, 214, 0.45)',
    glow: '#cfc9f2',
    mood: '睡眠'
  },
  coherent: { bg: '#dcecf8', border: 'rgba(140, 180, 214, 0.45)', glow: '#c4ddf0', mood: '专注' }
} as const;

export const defaultTint: MethodTint = {
  bg: '#e9e7f6',
  border: 'rgba(160, 160, 200, 0.4)',
  glow: '#d7d3ef',
  mood: '平静'
};

export function methodTint(id: string): MethodTint {
  return methodTints[id] ?? defaultTint;
}
