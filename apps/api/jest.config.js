/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/../../packages/shared/src/**/*.spec.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { isolatedModules: true }],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@inboudly/shared$': '<rootDir>/../../packages/shared/src',
    '^@inboudly/database$': '<rootDir>/../../packages/database/src',
  },
};
