import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@social-monitor/shared-kernel$': '<rootDir>/libs/shared-kernel/src/index.ts',
    '^@social-monitor/platform-config$': '<rootDir>/libs/platform/config/src/index.ts',
    '^@social-monitor/platform-events$': '<rootDir>/libs/platform/events/src/index.ts',
    '^@social-monitor/platform-events/(.*)$': '<rootDir>/libs/platform/events/src/$1',
    '^@social-monitor/platform-logging$': '<rootDir>/libs/platform/logging/src/index.ts',
    '^@social-monitor/platform-metrics$': '<rootDir>/libs/platform/metrics/src/index.ts',
    '^@social-monitor/platform-persistence$': '<rootDir>/libs/platform/persistence/src/index.ts',
    '^@social-monitor/platform-queue$': '<rootDir>/libs/platform/queue/src/index.ts',
    '^@social-monitor/platform-queue/(.*)$': '<rootDir>/libs/platform/queue/src/$1',
    '^@social-monitor/platform-request-context$': '<rootDir>/libs/platform/request-context/src/index.ts',
    '^@social-monitor/platform-worker$': '<rootDir>/libs/platform/worker/src/index.ts',
    '^@social-monitor/contracts/(.*)$': '<rootDir>/libs/contracts/$1',
    '^@social-monitor/([^/]+)/(.*)$': '<rootDir>/libs/$1/$2',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/prisma/generated/'],
  testEnvironment: 'node',
};

export default config;
