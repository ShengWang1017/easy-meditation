import {
  colors,
  customGradientColors,
  customGradientLocations,
  gradientColors,
  layout,
  shadows,
  typography
} from './tokens';

describe('prototype visual tokens', () => {
  it('uses the approved reference palette', () => {
    expect(colors).toMatchObject({
      ink: '#111622',
      muted: '#6d7483',
      backgroundTop: '#f0f2ff',
      backgroundMid: '#e9fbfb',
      backgroundBottom: '#f6f7f9',
      lilac: '#ece0f7',
      periwinkle: '#e0e6ff',
      blue: '#dfe9fb',
      mintBlue: '#d4eef6',
      activeNav: '#a8e8e0',
      teal: '#0b717a'
    });
  });

  it('keeps the custom-screen gradient distinct from the shared background', () => {
    expect(gradientColors).toEqual(['#f0f2ff', '#e9fbfb', '#f6f7f9']);
    expect(customGradientColors).toEqual([
      '#f0f2ff',
      '#f2f4ff',
      '#e8fbfa',
      '#f7f8fa'
    ]);
    expect(customGradientLocations).toEqual([0, 0.13, 0.58, 1]);
    expect(customGradientColors).not.toEqual(gradientColors);
  });

  it('names every measured 390-wide and compact layout value', () => {
    expect(layout).toEqual({
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
    });
  });

  it('names the measured reference type sizes', () => {
    expect(typography).toMatchObject({
      header: { fontSize: 32 },
      intro: { fontSize: 26 },
      cardTitle: { fontSize: 20 },
      cardMeta: { fontSize: 14 },
      beforeCardTitle: { fontSize: 21 },
      beforeCardBody: { fontSize: 15 },
      nav: { fontSize: 15 }
    });
  });

  it('preserves the exact reference card shadows', () => {
    expect(shadows).toMatchObject({
      methodCard: {
        boxShadow:
          'inset 0 1px 0 rgba(255, 255, 255, 0.48), 0 10px 20px rgba(111, 133, 160, 0.07)'
      },
      beforeCard: {
        boxShadow: '0 12px 24px rgba(111, 133, 160, 0.08)'
      }
    });
  });
});
