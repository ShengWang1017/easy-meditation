export const colors = {
  ink: '#111622',
  muted: '#6d7483',
  backgroundTop: '#f0f2ff',
  backgroundMid: '#e9fbfb',
  backgroundBottom: '#f6f7f9',
  customBackgroundTop: '#f0f2ff',
  customBackgroundUpper: '#f2f4ff',
  customBackgroundMid: '#e8fbfa',
  customBackgroundBottom: '#f7f8fa',
  lilac: '#ece0f7',
  periwinkle: '#e0e6ff',
  blue: '#dfe9fb',
  mintBlue: '#d4eef6',
  activeNav: '#a8e8e0',
  teal: '#0b717a',
  surface: 'rgba(255, 255, 255, 0.82)',
  surfaceStrong: '#ffffff',
  accent: '#49736f',
  accentStrong: '#0b717a',
  danger: '#a64242',
  mint: '#dff2ea',
  tabBorder: '#d4ddd9'
} as const;

export const gradientColors = [
  colors.backgroundTop,
  colors.backgroundMid,
  colors.backgroundBottom
] as const;

export const gradientLocations = [0, 0.56, 1] as const;

export const customGradientColors = [
  colors.customBackgroundTop,
  colors.customBackgroundUpper,
  colors.customBackgroundMid,
  colors.customBackgroundBottom
] as const;

export const customGradientLocations = [0, 0.13, 0.58, 1] as const;

export const layout = {
  screenGutter: 24,
  compactScreenGutter: 18,
  gridGap: 15,
  compactGridGap: 12,
  touchTarget: 44,
  headerIconTarget: 52,
  methodCardHeight: 178,
  compactMethodCardHeight: 162,
  methodCardRadius: 32,
  compactMethodCardRadius: 28,
  methodCardPadding: { top: 28, right: 22, bottom: 22, left: 22 },
  compactMethodCardPadding: { top: 21, right: 17, bottom: 18, left: 17 },
  beforeCardHeight: 112,
  beforeCardRadius: 25,
  navWidth: 170,
  navHeight: 42,
  navRadius: 24
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

export const typography = {
  header: { fontSize: 32, lineHeight: 32, fontWeight: '800' as const },
  intro: { fontSize: 26, lineHeight: 33.28, fontWeight: '800' as const },
  cardTitle: { fontSize: 20, lineHeight: 22.4, fontWeight: '800' as const },
  cardMeta: { fontSize: 14, lineHeight: 16.52, fontWeight: '500' as const },
  beforeCardTitle: { fontSize: 21, lineHeight: 22.05, fontWeight: '800' as const },
  beforeCardBody: { fontSize: 15, lineHeight: 21, fontWeight: '500' as const },
  nav: { fontSize: 15, fontWeight: '700' as const }
} as const;

// Existing screens continue to consume this compatibility map while the shared
// prototype components use the measured names above.
export const type = {
  hero: { fontSize: 40, fontWeight: '700' as const, lineHeight: 46 },
  title: { fontSize: 32, fontWeight: '700' as const, lineHeight: 38 },
  section: { fontSize: 20, fontWeight: '700' as const, lineHeight: 26 },
  cardTitle: { fontSize: 20, fontWeight: '700' as const, lineHeight: 28 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  label: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  meta: { fontSize: 14, fontWeight: '500' as const, lineHeight: 18 }
} as const;

export const shadows = {
  phoneShell: {
    boxShadow: '0 24px 72px rgba(81, 98, 118, 0.18)'
  },
  methodCard: {
    boxShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.48), 0 10px 20px rgba(111, 133, 160, 0.07)'
  },
  methodCardRaised: {
    boxShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.58), 0 16px 30px rgba(111, 133, 160, 0.12)'
  },
  durationPopover: {
    boxShadow:
      '0 14px 26px rgba(94, 117, 140, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.82)'
  },
  beforeCard: {
    boxShadow: '0 12px 24px rgba(111, 133, 160, 0.08)'
  },
  beforeCardClose: {
    boxShadow: '0 6px 14px rgba(87, 102, 122, 0.14)'
  },
  guideCard: {
    boxShadow: '0 10px 20px rgba(111, 133, 160, 0.07)'
  },
  customPicker: {
    boxShadow: '0 24px 52px rgba(74, 115, 137, 0.08)'
  }
} as const;

export const shadowSoft = shadows.methodCard;

export type MethodTint = {
  bg: string;
  border: string;
  glow: string;
  mood: string;
};

export const methodTints: Record<string, MethodTint> = {
  box: {
    bg: colors.lilac,
    border: 'rgba(196, 156, 192, 0.45)',
    glow: '#e7c7e4',
    mood: '放松'
  },
  'four-seven-eight': {
    bg: colors.periwinkle,
    border: 'rgba(160, 150, 214, 0.45)',
    glow: '#cfc9f2',
    mood: '睡眠'
  },
  coherent: {
    bg: colors.blue,
    border: 'rgba(140, 180, 214, 0.45)',
    glow: '#c4ddf0',
    mood: '专注'
  }
};

export const defaultTint: MethodTint = {
  bg: colors.mintBlue,
  border: 'rgba(160, 160, 200, 0.4)',
  glow: '#d7d3ef',
  mood: '平静'
};

export function methodTint(id: string): MethodTint {
  return methodTints[id] ?? defaultTint;
}
