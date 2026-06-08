import { readFileSync } from 'node:fs';

import type { RetentionPolicyRepositoryPort, RetentionPolicySet } from '../../ports';

export class JsonRetentionPolicyRepository implements RetentionPolicyRepositoryPort {
  constructor(private readonly contractPath: string) {}

  async load(): Promise<RetentionPolicySet> {
    return JSON.parse(readFileSync(this.contractPath, 'utf8')) as RetentionPolicySet;
  }
}
