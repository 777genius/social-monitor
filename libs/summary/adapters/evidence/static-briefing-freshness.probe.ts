import type { Clock } from '@social-monitor/shared-kernel';

import type { BriefingFreshness, BriefingFreshnessProbePort } from '../../ports';

export class StaticBriefingFreshnessProbe implements BriefingFreshnessProbePort {
  constructor(private readonly clock: Clock) {}

  async evaluate(): Promise<BriefingFreshness> {
    return {
      status: 'fresh',
      checkedAt: this.clock.now(),
    };
  }
}
