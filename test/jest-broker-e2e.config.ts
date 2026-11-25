/** @jest-config-loader ts-node */
import type { Config } from 'jest';

import e2eConfig from './jest-e2e.config';

const config: Config = {
  ...e2eConfig,
  testRegex: '\\.broker-e2e\\.ts$',
  testTimeout: 20_000,
};

export default config;
