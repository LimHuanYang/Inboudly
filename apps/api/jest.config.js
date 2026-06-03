/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    // Intentional: packages/shared has no jest setup of its own, so its pure
    // zod/schema specs (e.g. generate-video-schema.spec.ts) run here. Do not
    // remove — it is the only place these specs are discovered.
    '<rootDir>/../../packages/shared/src/**/*.spec.ts',
  ],
  transform: {
    // isolatedModules skips full type-checking (handled by `pnpm type-check`)
    // and does NOT emit decorator metadata. That's fine: our unit tests stub
    // providers and construct classes manually (new Service(...)) rather than
    // resolving them through the NestJS DI container, so design:paramtypes
    // metadata is not needed. Use test/jest-e2e.json for DI-based integration.
    '^.+\\.(t|j)s$': ['ts-jest', { isolatedModules: true }],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@inboudly/shared$': '<rootDir>/../../packages/shared/src',
    '^@inboudly/database$': '<rootDir>/../../packages/database/src',
  },
};
