'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/agent/**',       // heavy LLM code - excluded from coverage
    '!src/tools/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 15000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
};
