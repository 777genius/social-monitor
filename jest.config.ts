import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@social-monitor/shared-kernel$': '<rootDir>/libs/shared-kernel/src/index.ts',
    '^@social-monitor/platform-config$': '<rootDir>/libs/platform/config/src/index.ts',
    '^@social-monitor/platform-worker$': '<rootDir>/libs/platform/worker/src/index.ts',
    '^@social-monitor/contracts/(.*)$': '<rootDir>/libs/contracts/$1',
    '^@social-monitor/([^/]+)/(.*)$': '<rootDir>/libs/$1/$2',
  },
  collectCoverageFrom: ['apps/**/*.ts', 'libs/**/*.ts', '!**/*.spec.ts'],
  testEnvironment: 'node',
};

export default config;
