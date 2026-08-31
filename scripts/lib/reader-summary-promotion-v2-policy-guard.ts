import type { ReaderSummaryPolicy } from "@social-monitor/summary/domain";
import type {
  FindReaderSummaryPolicyByScopeQuery,
  ListScheduledReaderSummaryPoliciesQuery,
  ReaderSummaryPolicyRepositoryPort,
  ReaderSummaryEvidenceSelectorPort,
} from "@social-monitor/summary/ports";

import type { HistoricalPromotionPolicySnapshot } from
  "./reader-summary-promotion-v2-historical-generation-authority";

export class HistoricalPromotionPolicyGuard
implements ReaderSummaryPolicyRepositoryPort {
  constructor(
    private readonly delegate: ReaderSummaryPolicyRepositoryPort,
    private readonly expected: HistoricalPromotionPolicySnapshot,
  ) {}

  save(policy: ReaderSummaryPolicy): Promise<void> {
    void policy;
    throw new Error("Historical promotion policy mutation is prohibited");
  }

  async findByScope(
    query: FindReaderSummaryPolicyByScopeQuery,
  ): Promise<ReaderSummaryPolicy | null> {
    const current = await this.delegate.findByScope(query);
    if (current === null) {
      throw new Error("Prepared historical promotion policy is missing");
    }
    const snapshot = current.toSnapshot();
    const actual: HistoricalPromotionPolicySnapshot = {
      id: snapshot.id,
      language: snapshot.language,
      format: snapshot.format,
      tone: snapshot.tone,
      maxStories: snapshot.maxStories,
      includeRisks: snapshot.includeRisks,
      includeInterestHighlights: snapshot.includeInterestHighlights,
      includeRepeatedSignals: snapshot.includeRepeatedSignals,
      dedupeStrategy: snapshot.dedupeStrategy,
      customInstructions: snapshot.customInstructions ?? null,
      rulesVersion: snapshot.rulesVersion,
    };
    if (JSON.stringify(actual) !== JSON.stringify(this.expected)) {
      throw new Error("Prepared historical promotion policy changed");
    }
    return current;
  }

  listScheduled(
    query: ListScheduledReaderSummaryPoliciesQuery,
  ): Promise<readonly ReaderSummaryPolicy[]> {
    return this.delegate.listScheduled(query);
  }
}

export class HistoricalPromotionPolicyGuardedEvidenceSelector
implements ReaderSummaryEvidenceSelectorPort {
  constructor(
    private readonly delegate: ReaderSummaryEvidenceSelectorPort,
    private readonly policies: HistoricalPromotionPolicyGuard,
  ) {}

  async select(
    query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
  ) {
    await this.policies.findByScope({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      scope: query.scope,
    });
    return this.delegate.select(query);
  }
}
