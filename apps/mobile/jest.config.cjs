module.exports = {
  preset: 'jest-expo',
  rootDir: '.',
  testMatch: [
    '<rootDir>/**/*.native.test.ts',
    '<rootDir>/**/*.native.test.tsx'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/test/jest.setup.ts'],
  moduleNameMapper: { '\\.(svg)$': '<rootDir>/src/test/svgMock.js' }
};
