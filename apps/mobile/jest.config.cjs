module.exports = {
  preset: 'jest-expo',
  rootDir: '.',
  testEnvironment: '<rootDir>/src/test/skiaJestEnv.cjs',
  testMatch: [
    '<rootDir>/**/*.native.test.ts',
    '<rootDir>/**/*.native.test.tsx'
  ],
  setupFilesAfterEnv: [
    require.resolve('@shopify/react-native-skia/jestSetup.js'),
    '<rootDir>/src/test/jest.setup.ts'
  ],
  transformIgnorePatterns: [
    '/node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@shopify/react-native-skia)',
    '/node_modules/react-native-reanimated/plugin/'
  ],
  moduleNameMapper: { '\\.(svg)$': '<rootDir>/src/test/svgMock.js' }
};
