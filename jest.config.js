module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  reporters: ['default', ['jest-junit', { outputDirectory: 'test-output' }]],
  modulePathIgnorePatterns: ['lib'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['./src/**/*.ts']
};
