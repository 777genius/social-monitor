import type { SummaryEvidenceSelection, SummaryEvidenceSelectorPort } from '../../ports';

export class EmptySummaryEvidenceSelector implements SummaryEvidenceSelectorPort {
  async select(
    params: Parameters<SummaryEvidenceSelectorPort['select']>[0],
  ): Promise<SummaryEvidenceSelection> {
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - 1);

    return {
      sourceWindow: {
        windowId: `${params.tenantId}:${params.workspaceId}:${params.topicId}:empty`,
        startedAt,
        endedAt,
        selectedFeedItemIds: [],
      },
      items: [],
    };
  }
}
