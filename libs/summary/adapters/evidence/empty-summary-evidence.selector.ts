import type { Clock } from '@social-monitor/shared-kernel';

import type { SummaryEvidenceSelection, SummaryEvidenceSelectorPort } from '../../ports';

export class EmptySummaryEvidenceSelector implements SummaryEvidenceSelectorPort {
  constructor(private readonly clock: Clock) {}

  async select(
    params: Parameters<SummaryEvidenceSelectorPort['select']>[0],
  ): Promise<SummaryEvidenceSelection> {
    const endedAt = this.clock.now();
    const startedAt = new Date(endedAt.getTime() - 1);

    return {
      sourceWindow: {
        windowId: `${params.tenantId}:${params.workspaceId}:${params.interestId}:empty`,
        startedAt,
        endedAt,
        selectedFeedItemIds: [],
      },
      items: [],
    };
  }
}
