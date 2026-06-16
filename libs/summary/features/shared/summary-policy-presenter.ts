import type { SummaryPolicy } from '../../domain';

export type SummaryPolicyView = {
  readonly summaryPolicyId: string;
  readonly topicId: string;
  readonly language: string;
  readonly format: string;
  readonly tone: string;
  readonly maxKeyPoints: number;
  readonly includeRisks: boolean;
  readonly includeSourceHighlights: boolean;
  readonly customInstructions?: string;
  readonly rulesVersion: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export const presentSummaryPolicy = (policy: SummaryPolicy): SummaryPolicyView => {
  const snapshot = policy.toSnapshot();

  return {
    summaryPolicyId: snapshot.id,
    topicId: snapshot.topicId,
    language: snapshot.language,
    format: snapshot.format,
    tone: snapshot.tone,
    maxKeyPoints: snapshot.maxKeyPoints,
    includeRisks: snapshot.includeRisks,
    includeSourceHighlights: snapshot.includeSourceHighlights,
    customInstructions: snapshot.customInstructions,
    rulesVersion: snapshot.rulesVersion,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
};
