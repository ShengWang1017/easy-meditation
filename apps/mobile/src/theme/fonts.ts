export const fontFamilies = {
  display: 'LXGWWenKai-Medium',
  body: 'LXGWWenKai-Regular',
  system: undefined
} as const;

export const prototypeFontSources = {
  [fontFamilies.display]: require('../../assets/fonts/LXGWWenKai-Medium.ttf'),
  [fontFamilies.body]: require('../../assets/fonts/LXGWWenKai-Regular.ttf')
} as const;
