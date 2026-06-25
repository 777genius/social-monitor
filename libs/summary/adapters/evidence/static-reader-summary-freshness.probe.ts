import type { Clock } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryFreshness,
  ReaderSummaryFreshnessProbePort,
} from "../../ports";

export class StaticReaderSummaryFreshnessProbe implements ReaderSummaryFreshnessProbePort {
  constructor(private readonly clock: Clock) {}

  async evaluate(): Promise<ReaderSummaryFreshness> {
    return {
      status: "fresh",
      checkedAt: this.clock.now(),
    };
  }
}
