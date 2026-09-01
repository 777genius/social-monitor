import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryCitation } from "./citation";
import type { ReaderAction } from "./reader-action";
import type { ReaderSummarySnapshot } from "./reader-summary-snapshot";
import type { SourceMixEntry } from "./source-mix-entry";
import type {
  ReaderSummaryRisk,
  ReaderInterestSection,
  ReaderTrendDelta,
  RepeatedSignal,
  TopRead,
  TopReadCandidate,
  InterestHighlight,
} from "./top-read";
import type { ReaderSummaryScope } from "../value-objects/reader-summary-scope";
import type { ReaderSummaryPeriod } from "../value-objects/reader-summary-period";
import type { ProviderMetric } from "../value-objects/provider-metric-label";
import type {
  ReaderSummaryQualityFlag,
  ReaderSummaryQualityState,
} from "../value-objects/summary-quality";
import type {
  StoryCluster,
  RelatedTopicRelation,
  SummaryEvidencePersonalization,
  SummarySourceWindow,
} from "../value-objects/summary-evidence-item";
import { assertReaderSummaryArtifactValid } from "./reader-summary-artifact-validation";
import { assertReaderSummaryCitationsAgainstEvidence } from "./reader-summary-citation-evidence-validation";
import type {
  ReaderPostPromotionAttestation,
  ReaderPostPromotionInput,
} from "../policies/reader-post-promotion-policy";

export { assertReaderSummaryCitationsAgainstEvidence };

export type ReaderSummaryProviderMetric = ProviderMetric;
export type ReaderSummaryTopStory = TopReadCandidate;
export type ReaderSummaryInterestHighlight = InterestHighlight;
export type ReaderSummaryRepeatedSignal = RepeatedSignal;
export type ReaderSummaryItemConfidence = TopRead["confidence"];
export type ReaderSummaryItem = TopRead;
export type ReaderSummaryInterestSection = ReaderInterestSection;
export type ReaderSummarySourceMixEntry = SourceMixEntry;
export type ReaderSummaryTrendDelta = ReaderTrendDelta;
export type ReaderSummaryNextAction = ReaderAction;
export type ReaderSummaryQualityStateSnapshot = ReaderSummaryQualityState;
export type ReaderSummaryContent = ReaderSummarySnapshot;

export type ReaderSummaryContextArtifact = {
  readonly artifactId: string;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly summaryText: string;
  readonly generatedAt: Date;
  readonly freshness: "fresh" | "stale" | "unknown";
};

export type ReaderSummaryLineage = {
  readonly promptVersion: string;
  readonly schemaVersion: "reader_summary.artifact.v1";
  readonly modelVersion: string;
  readonly providerVersion: string;
  readonly rulesVersion: string;
  readonly evalDatasetVersion: string;
  readonly rankingPolicyVersion?: string;
};

export type ReaderSummaryUsage = {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly estimatedCostUsd: number;
};

export type ReaderSummaryConfidence = {
  readonly level: "none" | "low" | "medium" | "high";
  readonly score: number;
  readonly rationale: string;
};

export type ReaderSummaryArtifactProps = {
  readonly schemaVersion: "reader_summary.artifact.v1";
  readonly readerSummaryId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly generatedAt?: Date;
  readonly sourceWindow: SummarySourceWindow;
  readonly storyClusters: readonly StoryCluster[];
  readonly relatedTopicRelations?: readonly RelatedTopicRelation[];
  readonly promotionAttestations?: readonly ReaderPostPromotionAttestation[];
  readonly promotionEvidenceFacts?: readonly ReaderPostPromotionInput[];
  readonly promotionBoardState?: "legacy_unavailable";
  readonly contextArtifacts: readonly ReaderSummaryContextArtifact[];
  readonly personalization?: SummaryEvidencePersonalization;
  readonly headline: string;
  readonly executiveSummary: string;
  readonly content?: ReaderSummaryContent;
  readonly topStories: readonly ReaderSummaryTopStory[];
  readonly interestHighlights: readonly ReaderSummaryInterestHighlight[];
  readonly repeatedSignals: readonly ReaderSummaryRepeatedSignal[];
  readonly risksAndUnknowns: readonly ReaderSummaryRisk[];
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly qualityFlags: readonly ReaderSummaryQualityFlag[];
  readonly confidence: ReaderSummaryConfidence;
  readonly lineage: ReaderSummaryLineage;
  readonly usage: ReaderSummaryUsage;
  readonly noSignalReason?: string;
};

export type GeneratedReaderSummaryDraft = Omit<
  ReaderSummaryArtifactProps,
  | "schemaVersion"
  | "readerSummaryId"
  | "tenantId"
  | "workspaceId"
  | "scope"
  | "period"
  | "userId"
  | "subscriptionId"
  | "sourceWindow"
  | "storyClusters"
  | "relatedTopicRelations"
  | "promotionAttestations"
  | "promotionEvidenceFacts"
  | "promotionBoardState"
  | "contextArtifacts"
  | "personalization"
> & {
  readonly lineage: ReaderSummaryLineage;
  readonly usage: ReaderSummaryUsage;
};

export class ReaderSummaryArtifact {
  private constructor(private readonly props: ReaderSummaryArtifactProps) {}

  static create(props: ReaderSummaryArtifactProps): ReaderSummaryArtifact {
    assertReaderSummaryArtifactValid(props);

    return new ReaderSummaryArtifact(withImmutablePromotionAttestations(props));
  }

  static rehydrate(props: ReaderSummaryArtifactProps): ReaderSummaryArtifact {
    assertReaderSummaryArtifactValid(props);

    return new ReaderSummaryArtifact(withImmutablePromotionAttestations(props));
  }

  toSnapshot(): ReaderSummaryArtifactProps {
    return {
      ...this.props,
      period: cloneReaderSummaryPeriod(this.props.period),
      sourceWindow: cloneSummarySourceWindow(this.props.sourceWindow),
      promotionAttestations: clonePromotionAttestations(
        this.props.promotionAttestations ?? [],
      ),
      promotionEvidenceFacts: (this.props.promotionEvidenceFacts ?? []).map(
        clonePromotionInput,
      ),
    };
  }
}

const withImmutablePromotionAttestations = (
  props: ReaderSummaryArtifactProps,
): ReaderSummaryArtifactProps => ({
  ...props,
  period: freezeReaderSummaryPeriod(props.period),
  sourceWindow: freezeSummarySourceWindow(props.sourceWindow),
  promotionAttestations: Object.freeze(
    clonePromotionAttestations(props.promotionAttestations ?? [])
      .map(freezePromotionAttestation),
  ),
  promotionEvidenceFacts: Object.freeze(
    (props.promotionEvidenceFacts ?? []).map(clonePromotionInput)
      .map(freezePromotionInput),
  ),
});

const freezeDate = (value: Date): Date => Object.freeze(value);

const cloneReaderSummaryPeriod = (
  period: ReaderSummaryPeriod,
): ReaderSummaryPeriod => ({
  ...period,
  startedAt: new Date(period.startedAt),
  endedAt: new Date(period.endedAt),
});

const freezeReaderSummaryPeriod = (
  period: ReaderSummaryPeriod,
): ReaderSummaryPeriod => Object.freeze({
  ...cloneReaderSummaryPeriod(period),
  startedAt: freezeDate(new Date(period.startedAt)),
  endedAt: freezeDate(new Date(period.endedAt)),
});

const cloneSummarySourceWindow = (
  sourceWindow: SummarySourceWindow,
): SummarySourceWindow => ({
  ...sourceWindow,
  startedAt: new Date(sourceWindow.startedAt),
  endedAt: new Date(sourceWindow.endedAt),
  selectedFeedItemIds: [...sourceWindow.selectedFeedItemIds],
  storyClusterIds: [...sourceWindow.storyClusterIds],
  ...(sourceWindow.periodStartedAt === undefined ? {} : {
    periodStartedAt: new Date(sourceWindow.periodStartedAt),
  }),
  ...(sourceWindow.periodEndedAt === undefined ? {} : {
    periodEndedAt: new Date(sourceWindow.periodEndedAt),
  }),
  ...(sourceWindow.ingestionCutoff === undefined ? {} : {
    ingestionCutoff: new Date(sourceWindow.ingestionCutoff),
  }),
});

const freezeSummarySourceWindow = (
  sourceWindow: SummarySourceWindow,
): SummarySourceWindow => Object.freeze({
  ...cloneSummarySourceWindow(sourceWindow),
  startedAt: freezeDate(new Date(sourceWindow.startedAt)),
  endedAt: freezeDate(new Date(sourceWindow.endedAt)),
  selectedFeedItemIds: Object.freeze([...sourceWindow.selectedFeedItemIds]),
  storyClusterIds: Object.freeze([...sourceWindow.storyClusterIds]),
  ...(sourceWindow.periodStartedAt === undefined ? {} : {
    periodStartedAt: freezeDate(new Date(sourceWindow.periodStartedAt)),
  }),
  ...(sourceWindow.periodEndedAt === undefined ? {} : {
    periodEndedAt: freezeDate(new Date(sourceWindow.periodEndedAt)),
  }),
  ...(sourceWindow.ingestionCutoff === undefined ? {} : {
    ingestionCutoff: freezeDate(new Date(sourceWindow.ingestionCutoff)),
  }),
});

const freezePromotionInput = (
  fact: ReaderPostPromotionAttestation["supportFacts"][number],
): ReaderPostPromotionAttestation["supportFacts"][number] => Object.freeze({
  ...fact,
  publishedAt: freezeDate(fact.publishedAt),
  observedAt: freezeDate(fact.observedAt),
  periodStart: freezeDate(fact.periodStart),
  periodEnd: freezeDate(fact.periodEnd),
  ingestionCutoff: freezeDate(fact.ingestionCutoff),
  ...(fact.checkedAt === undefined ? {} : { checkedAt: freezeDate(fact.checkedAt) }),
  ...(fact.authorityAttestation === undefined ? {} : {
    authorityAttestation: Object.freeze(fact.authorityAttestation),
  }),
  ...(fact.relation === undefined ? {} : {
    relation: Object.freeze(fact.relation),
  }),
  ...(fact.metrics === undefined ? {} : {
    metrics: Object.freeze(fact.metrics.provider === "github_radar" ? {
      ...fact.metrics,
      windowStartedAt: freezeDate(fact.metrics.windowStartedAt),
      windowEndedAt: freezeDate(fact.metrics.windowEndedAt),
    } : fact.metrics),
  }),
});

const freezePromotionAttestation = (
  attestation: ReaderPostPromotionAttestation,
): ReaderPostPromotionAttestation => Object.freeze({
  ...attestation,
  periodStartedAt: freezeDate(attestation.periodStartedAt),
  periodEndedAt: freezeDate(attestation.periodEndedAt),
  ingestionCutoff: freezeDate(attestation.ingestionCutoff),
  publishedAt: freezeDate(attestation.publishedAt),
  observedAt: freezeDate(attestation.observedAt),
  ...(attestation.checkedAt === undefined ? {} : {
    checkedAt: freezeDate(attestation.checkedAt),
  }),
  usefulnessComponents: Object.freeze(attestation.usefulnessComponents),
  supportFacts: Object.freeze(attestation.supportFacts.map(freezePromotionInput)),
  citationIds: Object.freeze([...attestation.citationIds]),
  ...(attestation.authorityAttestation === undefined ? {} : {
    authorityAttestation: Object.freeze(attestation.authorityAttestation),
  }),
  ...(attestation.relationTrace === undefined ? {} : {
    relationTrace: Object.freeze(attestation.relationTrace),
  }),
  ...(attestation.metrics === undefined ? {} : {
    metrics: Object.freeze(attestation.metrics.provider === "github_radar" ? {
      ...attestation.metrics,
      windowStartedAt: freezeDate(attestation.metrics.windowStartedAt),
      windowEndedAt: freezeDate(attestation.metrics.windowEndedAt),
    } : attestation.metrics),
  }),
  ...(attestation.schemaVersion !== "reader_post_promotion_attestation.v2"
    ? {}
    : {
        scoreComponents: Object.freeze({ ...attestation.scoreComponents }),
        reasonCodes: Object.freeze([...attestation.reasonCodes]),
        evidenceLineage: Object.freeze({
          ...attestation.evidenceLineage,
          supportCandidateIds: Object.freeze([
            ...attestation.evidenceLineage.supportCandidateIds,
          ]),
          supportCitationIds: Object.freeze([
            ...attestation.evidenceLineage.supportCitationIds,
          ]),
          citationIds: Object.freeze([
            ...attestation.evidenceLineage.citationIds,
          ]),
        }),
      }),
});

const clonePromotionAttestations = (
  attestations: readonly ReaderPostPromotionAttestation[],
): readonly ReaderPostPromotionAttestation[] => attestations.map((attestation) => ({
  ...attestation,
  publishedAt: new Date(attestation.publishedAt),
  observedAt: new Date(attestation.observedAt),
  periodStartedAt: new Date(attestation.periodStartedAt),
  periodEndedAt: new Date(attestation.periodEndedAt),
  ingestionCutoff: new Date(attestation.ingestionCutoff),
  ...(attestation.checkedAt === undefined
    ? {}
    : { checkedAt: new Date(attestation.checkedAt) }),
  usefulnessComponents: { ...attestation.usefulnessComponents },
  supportFacts: attestation.supportFacts.map((fact) => ({
    ...fact,
    publishedAt: new Date(fact.publishedAt),
    observedAt: new Date(fact.observedAt),
    periodStart: new Date(fact.periodStart),
    periodEnd: new Date(fact.periodEnd),
    ingestionCutoff: new Date(fact.ingestionCutoff),
    ...(fact.checkedAt === undefined
      ? {}
      : { checkedAt: new Date(fact.checkedAt) }),
    ...(fact.metrics?.provider === "github_radar"
      ? { metrics: {
          ...fact.metrics,
          windowStartedAt: new Date(fact.metrics.windowStartedAt),
          windowEndedAt: new Date(fact.metrics.windowEndedAt),
        } }
      : fact.metrics === undefined ? {} : { metrics: { ...fact.metrics } }),
    ...(fact.authorityAttestation === undefined
      ? {}
      : { authorityAttestation: { ...fact.authorityAttestation } }),
    ...(fact.relation === undefined
      ? {}
      : { relation: { ...fact.relation } }),
  })),
  citationIds: [...attestation.citationIds],
  ...(attestation.authorityAttestation === undefined
    ? {}
    : { authorityAttestation: { ...attestation.authorityAttestation } }),
  ...(attestation.relationTrace === undefined
    ? {}
    : { relationTrace: { ...attestation.relationTrace } }),
  ...(attestation.metrics === undefined
    ? {}
    : attestation.metrics.provider === "github_radar"
      ? {
          metrics: {
            ...attestation.metrics,
            windowStartedAt: new Date(attestation.metrics.windowStartedAt),
            windowEndedAt: new Date(attestation.metrics.windowEndedAt),
          },
        }
      : { metrics: { ...attestation.metrics } }),
  ...(attestation.schemaVersion !== "reader_post_promotion_attestation.v2"
    ? {}
    : {
        scoreComponents: { ...attestation.scoreComponents },
        reasonCodes: [...attestation.reasonCodes],
        evidenceLineage: {
          ...attestation.evidenceLineage,
          supportCandidateIds: [
            ...attestation.evidenceLineage.supportCandidateIds,
          ],
          supportCitationIds: [
            ...attestation.evidenceLineage.supportCitationIds,
          ],
          citationIds: [...attestation.evidenceLineage.citationIds],
        },
      }),
}));

const clonePromotionInput = (
  fact: ReaderPostPromotionInput,
): ReaderPostPromotionInput => ({
  ...fact,
  publishedAt: new Date(fact.publishedAt),
  observedAt: new Date(fact.observedAt),
  periodStart: new Date(fact.periodStart),
  periodEnd: new Date(fact.periodEnd),
  ingestionCutoff: new Date(fact.ingestionCutoff),
  ...(fact.checkedAt === undefined ? {} : { checkedAt: new Date(fact.checkedAt) }),
  ...(fact.metrics?.provider === "github_radar" ? { metrics: {
    ...fact.metrics,
    windowStartedAt: new Date(fact.metrics.windowStartedAt),
    windowEndedAt: new Date(fact.metrics.windowEndedAt),
  } } : fact.metrics === undefined ? {} : { metrics: { ...fact.metrics } }),
  ...(fact.authorityAttestation === undefined ? {} : {
    authorityAttestation: { ...fact.authorityAttestation },
  }),
  ...(fact.relation === undefined ? {} : { relation: { ...fact.relation } }),
});
