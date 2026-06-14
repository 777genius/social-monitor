import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SummaryQualityFlag =
  | 'no_signal'
  | 'low_confidence'
  | 'conflicting_evidence'
  | 'limited_sources';

export type SummaryCitation = {
  readonly citationId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly field: 'title' | 'bodyPreview' | 'canonicalUrl';
};

export type SummaryKeyPoint = {
  readonly claim: string;
  readonly citationIds: readonly string[];
};

export type SummaryRisk = {
  readonly description: string;
  readonly citationIds?: readonly string[];
  readonly reason?: 'insufficient_evidence' | 'conflicting_evidence' | 'source_limit';
};

export type SummarySourceWindow = {
  readonly windowId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly selectedFeedItemIds: readonly string[];
};

export type SummaryLineage = {
  readonly promptVersion: string;
  readonly schemaVersion: 'summary.artifact.v1';
  readonly modelVersion: string;
  readonly providerVersion: string;
  readonly rulesVersion: string;
  readonly evalDatasetVersion: string;
};

export type SummaryUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
};

export type SummaryConfidence = {
  readonly level: 'none' | 'low' | 'medium' | 'high';
  readonly score: number;
  readonly rationale: string;
};

export type SummaryArtifactProps = {
  readonly schemaVersion: 'summary.artifact.v1';
  readonly summaryId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly sourceWindow: SummarySourceWindow;
  readonly headline: string;
  readonly executiveSummary: string;
  readonly keyPoints: readonly SummaryKeyPoint[];
  readonly risksAndUnknowns: readonly SummaryRisk[];
  readonly sourceHighlights: readonly string[];
  readonly citationMap: readonly SummaryCitation[];
  readonly qualityFlags: readonly SummaryQualityFlag[];
  readonly confidence: SummaryConfidence;
  readonly lineage: SummaryLineage;
  readonly usage: SummaryUsage;
  readonly noSignalReason?: string;
};

export class SummaryArtifact {
  private constructor(private readonly props: SummaryArtifactProps) {}

  static create(props: SummaryArtifactProps): SummaryArtifact {
    this.assertValid(props);

    return new SummaryArtifact(props);
  }

  static rehydrate(props: SummaryArtifactProps): SummaryArtifact {
    this.assertValid(props);

    return new SummaryArtifact(props);
  }

  toSnapshot(): SummaryArtifactProps {
    return { ...this.props };
  }

  private static assertValid(props: SummaryArtifactProps): void {
    if (props.schemaVersion !== 'summary.artifact.v1') {
      throw new Error('Unsupported summary schema version');
    }

    if (props.topicId.trim().length === 0) {
      throw new Error('Summary topic id must be non-empty');
    }

    if (props.sourceWindow.endedAt.getTime() <= props.sourceWindow.startedAt.getTime()) {
      throw new Error('Summary source window end must be after start');
    }

    const citationIds = new Set<string>();

    for (const citation of props.citationMap) {
      if (citation.citationId.trim().length === 0) {
        throw new Error('Summary citation id must be non-empty');
      }

      if (citationIds.has(citation.citationId)) {
        throw new Error('Summary citation ids must be unique');
      }

      citationIds.add(citation.citationId);
    }

    for (const keyPoint of props.keyPoints) {
      if (keyPoint.claim.trim().length === 0 || keyPoint.citationIds.length === 0) {
        throw new Error('Summary key point must have a claim and citations');
      }

      for (const citationId of keyPoint.citationIds) {
        if (!citationIds.has(citationId)) {
          throw new Error('Summary key point cites evidence outside citation map');
        }
      }
    }

    for (const risk of props.risksAndUnknowns) {
      for (const citationId of risk.citationIds ?? []) {
        if (!citationIds.has(citationId)) {
          throw new Error('Summary risk cites evidence outside citation map');
        }
      }
    }

    if (props.keyPoints.length === 0 && !props.qualityFlags.includes('no_signal')) {
      throw new Error('No-signal summary must include no_signal quality flag');
    }

    if (props.qualityFlags.includes('no_signal') && (props.noSignalReason ?? '').trim().length === 0) {
      throw new Error('No-signal summary must include a reason');
    }

    if (props.usage.inputTokens < 0 || props.usage.outputTokens < 0 || props.usage.estimatedCostUsd < 0) {
      throw new Error('Summary usage values must be non-negative');
    }

    if (props.confidence.score < 0 || props.confidence.score > 1) {
      throw new Error('Summary confidence score must be between 0 and 1');
    }

    if (props.confidence.level === 'none' && !props.qualityFlags.includes('no_signal')) {
      throw new Error('No-confidence summary must include no_signal quality flag');
    }

    if (props.confidence.rationale.trim().length === 0) {
      throw new Error('Summary confidence rationale must be non-empty');
    }
  }
}
