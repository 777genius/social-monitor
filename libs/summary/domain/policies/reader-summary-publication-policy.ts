import type {
  ReaderSummaryArtifact,
  ReaderSummaryContent,
} from "../entities/reader-summary-artifact";
import type { TopRead } from "../entities/top-read";
import type { SummaryEvidenceSelection } from "../value-objects/summary-evidence-item";
import {
  buildReaderSummaryCoveragePlan,
  type ReaderSummaryCoveragePlan,
} from "../services/reader-summary-coverage-plan";
import { evaluateReaderSummaryArtifactEditorialQuality } from "./reader-summary-artifact-editorial-quality-policy";
import { primaryReaderSummaryEvidence } from "./reader-summary-github-trending-policy";
import type {
  ReaderSummaryPublicationDecision,
  ReaderSummaryPublicationRejectionFinding,
} from "./reader-summary-publication-decision";
import { publicationShadowReport } from "./reader-summary-publication-shadow";
import { isTopReadEligibleEvidence } from "./top-read-eligibility-policy";

export { withReaderSummaryPublicationRejections } from "./reader-summary-publication-decision";
export type {
  ReaderSummaryPublicationDecision,
  ReaderSummaryPublicationRejectionCode,
  ReaderSummaryPublicationRejectionFinding,
  ReaderSummaryPublicationShadowReport,
  ReaderSummaryPublicationShadowSignal,
  ReaderSummaryPublicationShadowSignalCode,
} from "./reader-summary-publication-decision";

export class ReaderSummaryPublicationPolicy {
  evaluate(params: {
    readonly artifact: ReaderSummaryArtifact;
    readonly evidence: SummaryEvidenceSelection;
  }): ReaderSummaryPublicationDecision {
    const snapshot = params.artifact.toSnapshot();
    const noSignal = isValidNoSignalArtifact(snapshot);
    const citationById = new Map(
      snapshot.citationMap.map(
        (citation) => [citation.citationId, citation] as const,
      ),
    );
    const evidenceByFeedItemId = new Map(
      params.evidence.selectedEvidence.map(
        (item) => [item.feedItemId, item] as const,
      ),
    );
    const technicalLeaks = unique([
      ...collectTechnicalLeaks([snapshot.headline, snapshot.executiveSummary]),
      ...(snapshot.content === undefined
        ? []
        : collectReaderSummaryUserFacingTechnicalLeaks(snapshot.content)),
    ]);
    const topReads = topReadReferences(snapshot);
    const shadow = publicationShadowReport(params);
    const rejectionFindings: ReaderSummaryPublicationRejectionFinding[] = [];

    if (!noSignal && topReads.length === 0) {
      rejectionFindings.push({
        code: "no_top_reads",
        reason: "Reader summary artifact has no publishable top reads.",
      });
    }

    for (const leak of technicalLeaks) {
      rejectionFindings.push({
        code: "technical_leakage",
        reason: `Reader summary user-facing text contains technical leakage: ${leak}`,
      });
    }

    if (snapshot.qualityFlags.includes("no_signal") && !noSignal) {
      rejectionFindings.push({
        code: "editorial_quality",
        reason:
          "Reader summary editorial quality gate failed: no_signal flag conflicts with publishable content",
      });
    }

    if (!noSignal) {
      const coveragePlan = buildReaderSummaryCoveragePlan(
        primaryReaderSummaryEvidence(params.evidence),
      );
      const editorialQuality = evaluateReaderSummaryArtifactEditorialQuality(
        editorialQualityInput(
          snapshot,
          coveragePlan.mode,
        ),
      );
      for (const issue of editorialQuality.issues) {
        rejectionFindings.push({
          code: "editorial_quality",
          reason: `Reader summary editorial quality gate failed: ${issue}`,
        });
      }
      for (const issue of coveragePlanIssues(snapshot, coveragePlan)) {
        rejectionFindings.push({
          code: "editorial_quality",
          reason: `Reader summary editorial quality gate failed: ${issue}`,
        });
      }
    }

    for (const topRead of topReads) {
      if (topRead.citationIds.length === 0) {
        rejectionFindings.push({
          code: "top_read_missing_citation",
          reason: `Top read "${topRead.title}" has no citation.`,
          topReadTitle: topRead.title,
        });
        continue;
      }

      for (const citationId of topRead.citationIds) {
        const citation = citationById.get(citationId);
        if (citation === undefined) {
          rejectionFindings.push({
            code: "top_read_citation_not_found",
            reason: `Top read "${topRead.title}" references unknown citation "${citationId}".`,
            topReadTitle: topRead.title,
            citationId,
          });
          continue;
        }

        const evidence = evidenceByFeedItemId.get(citation.feedItemId);
        if (evidence === undefined) {
          rejectionFindings.push({
            code: "top_read_evidence_not_found",
            reason: `Top read "${topRead.title}" references evidence outside the selected window.`,
            topReadTitle: topRead.title,
            citationId: citation.citationId,
            feedItemId: citation.feedItemId,
            sourceItemId: citation.sourceItemId,
            providerKey: citation.providerKey,
            canonicalUrl: citation.canonicalUrl,
          });
          continue;
        }

        if (!isTopReadEligibleEvidence(evidence)) {
          rejectionFindings.push({
            code: "top_read_ineligible_source",
            reason: `Top read "${topRead.title}" references ineligible ${evidence.providerKey} evidence.`,
            topReadTitle: topRead.title,
            citationId: citation.citationId,
            feedItemId: citation.feedItemId,
            sourceItemId: citation.sourceItemId,
            providerKey: evidence.providerKey,
            canonicalUrl: evidence.canonicalUrl,
          });
        }
      }
    }

    const canonicalScore = canonicalPublicationScore({
      topReadCount: topReads.length,
      rejectionCount: rejectionFindings.length,
      confidenceScore: snapshot.confidence.score,
      selectedEvidenceCount: params.evidence.selectedEvidence.length,
      providerCount: new Set(
        params.evidence.selectedEvidence.map((item) => item.providerKey),
      ).size,
    });

    if (rejectionFindings.length > 0) {
      return {
        status: "rejected",
        qualityPassed: false,
        canonicalScore,
        shadow,
        reasonCodes: unique(rejectionFindings.map((item) => item.code)),
        reasons: unique(rejectionFindings.map((item) => item.reason)),
        findings: rejectionFindings,
      };
    }

    return {
      status: "published",
      qualityPassed: true,
      canonicalScore,
      shadow,
      reasons: noSignal
        ? ["Reader summary artifact is a valid no-signal result."]
        : ["Reader summary artifact passed pre-publish quality gates."],
    };
  }
}

export const collectReaderSummaryUserFacingTechnicalLeaks = (
  content: ReaderSummaryContent,
): readonly string[] => {
  const values = [
    content.headline,
    content.oneLineTakeaway,
    ...content.bullets,
    ...(content.narrativeSections ?? []).flatMap((section) => [
      section.title,
      section.text,
    ]),
    ...content.risks,
    ...content.openQuestions,
    ...content.nextActions.flatMap((item) => [item.label, item.reason]),
    ...content.topReads.flatMap(topReadUserFacingText),
    ...(content.selectedPosts ?? []).flatMap(topReadUserFacingText),
  ];

  return collectTechnicalLeaks(values);
};

const isValidNoSignalArtifact = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
): boolean => {
  if (
    !snapshot.qualityFlags.includes("no_signal") ||
    snapshot.topStories.length > 0
  ) {
    return false;
  }

  const content = snapshot.content;
  return (
    content === undefined ||
    ((content.qualityState.status === "no_signal" ||
      content.qualityState.flags.includes("no_signal")) &&
      content.topReads.length === 0 &&
      (content.narrativeSections ?? []).every(
        (section) => section.kind === "watch",
      ))
  );
};

const coveragePlanIssues = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
  coveragePlan: ReaderSummaryCoveragePlan,
): readonly string[] => {
  const narrativeSections = snapshot.content?.narrativeSections ?? [];
  const leads = narrativeSections.filter((section) => section.kind === "lead");
  const lead = leads.length === 1 ? leads[0] : undefined;
  if (lead === undefined || coveragePlan.lead === undefined) {
    return coveragePlan.lead === undefined
      ? ["Deterministic coverage plan has no publishable lead"]
      : [];
  }
  const clusterIdsByFeedItemId = storyClusterIdsByFeedItemId(snapshot);
  const citationById = new Map(
    snapshot.citationMap.map(
      (citation) => [citation.citationId, citation] as const,
    ),
  );
  const clusterIdForCitation = (citationId: string): string | undefined => {
    const feedItemId = citationById.get(citationId)?.feedItemId;
    const clusterIds =
      feedItemId === undefined
        ? undefined
        : clusterIdsByFeedItemId.get(feedItemId);
    return clusterIds?.size === 1 ? [...clusterIds][0] : undefined;
  };
  const citationClusterIds = (citationIds: readonly string[]) =>
    distinctDefined(citationIds.map(clusterIdForCitation));
  const plannedClusterIds = new Set([
    coveragePlan.lead.clusterId,
    ...coveragePlan.secondary.map((item) => item.clusterId),
  ]);
  const leadCitationClusterIds = citationClusterIds(lead.citationIds);
  const mainNarrativeCitationClusterIds = distinctDefined(
    narrativeSections
      .filter((section) => section.kind !== "watch")
      .flatMap((section) => section.citationIds)
      .map(clusterIdForCitation),
  );
  const secondaryIssues = narrativeSections
    .filter((section) => section.kind === "secondary_signal")
    .flatMap((section) => {
      const sectionClusterId = section.storyClusterId;
      return [
        ...(sectionClusterId === undefined ||
        !coveragePlan.secondary.some(
          (item) => item.clusterId === sectionClusterId,
        )
          ? ["Secondary signal is outside the deterministic coverage plan"]
          : []),
        ...(sectionClusterId !== undefined &&
        section.citationIds.some(
          (citationId) =>
            clusterIdForCitation(citationId) !== sectionClusterId,
        )
          ? ["Secondary signal cites evidence from another story cluster"]
          : []),
      ];
    });

  return unique([
    ...(coveragePlan.mode === "daily_synthesis" &&
    lead.storyClusterId !== undefined
      ? ["Daily synthesis lead must not be bound to one story cluster"]
      : []),
    ...(coveragePlan.mode === "daily_synthesis" &&
    !leadCitationClusterIds.includes(coveragePlan.lead.clusterId)
      ? ["Daily synthesis lead must cite the planned lead story cluster"]
      : []),
    ...(coveragePlan.mode === "daily_synthesis" &&
    !coveragePlan.secondary.some((item) =>
      leadCitationClusterIds.includes(item.clusterId),
    )
      ? ["Daily synthesis lead must cite a planned secondary story cluster"]
      : []),
    ...(coveragePlan.mode === "single_story" &&
    lead.storyClusterId !== coveragePlan.lead.clusterId
      ? ["Single-story lead does not match the deterministic coverage plan"]
      : []),
    ...mainNarrativeCitationClusterIds
      .filter((clusterId) => !plannedClusterIds.has(clusterId))
      .map(
        () => "Main narrative cites a story outside the deterministic coverage plan",
      ),
    ...secondaryIssues,
  ]);
};

const editorialQualityInput = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
  coverageMode: Parameters<
    typeof evaluateReaderSummaryArtifactEditorialQuality
  >[0]["coverageMode"],
): Parameters<typeof evaluateReaderSummaryArtifactEditorialQuality>[0] => {
  const narrativeSections = snapshot.content?.narrativeSections ?? [];
  const clusterIdsByFeedItemId = storyClusterIdsByFeedItemId(snapshot);

  return {
    headline: snapshot.content?.headline ?? snapshot.headline,
    coverageMode,
    topPostTitles: topReadReferences(snapshot).map((item) => item.title),
    citations: snapshot.citationMap.map((citation) => {
      const storyClusterIds = clusterIdsByFeedItemId.get(citation.feedItemId);
      const storyClusterId =
        storyClusterIds?.size === 1 ? [...storyClusterIds][0] : undefined;
      return {
        citationId: citation.citationId,
        providerKey: citation.providerKey,
        ...(storyClusterId === undefined ? {} : { storyClusterId }),
      };
    }),
    narrativeSections: narrativeSections.map((section) => ({
      kind: section.kind,
      title: section.title,
      text: section.text,
      citationIds: section.citationIds,
      ...(section.storyClusterId === undefined
        ? {}
        : { storyClusterId: section.storyClusterId }),
    })),
    renderedMarkdown: renderedNarrativeMarkdown(
      snapshot.content?.headline ?? snapshot.headline,
      narrativeSections,
    ),
  };
};

const renderedNarrativeMarkdown = (
  headline: string,
  sections: NonNullable<ReaderSummaryContent["narrativeSections"]>,
): string =>
  [
    `# ${headline}`,
    ...sections.map((section) => `## ${section.title}\n\n${section.text}`),
  ].join("\n\n");

const storyClusterIdsByFeedItemId = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
): ReadonlyMap<string, ReadonlySet<string>> => {
  const clusterIdsByFeedItemId = new Map<string, Set<string>>();
  for (const cluster of snapshot.storyClusters) {
    for (const feedItemId of [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]) {
      const clusterIds = clusterIdsByFeedItemId.get(feedItemId) ?? new Set();
      clusterIds.add(cluster.id);
      clusterIdsByFeedItemId.set(feedItemId, clusterIds);
    }
  }

  return clusterIdsByFeedItemId;
};

const topReadReferences = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
): readonly {
  readonly title: string;
  readonly citationIds: readonly string[];
}[] => {
  const topReads = snapshot.content?.topReads;
  if (topReads !== undefined && topReads.length > 0) {
    return topReads.map((item) => ({
      title: item.title,
      citationIds: item.citationIds,
    }));
  }

  return snapshot.topStories.map((item) => ({
    title: item.title,
    citationIds: item.citationIds,
  }));
};

const topReadUserFacingText = (item: TopRead): readonly string[] => [
  item.title,
  item.reason,
  item.whyNow,
  ...item.whyImportant,
];

const canonicalPublicationScore = (params: {
  readonly topReadCount: number;
  readonly rejectionCount: number;
  readonly confidenceScore: number;
  readonly selectedEvidenceCount: number;
  readonly providerCount: number;
}): number => {
  const topReadScore = Math.min(1, params.topReadCount / 10) * 0.35;
  const evidenceScore = Math.min(1, params.selectedEvidenceCount / 80) * 0.2;
  const providerScore = Math.min(1, params.providerCount / 3) * 0.15;
  const confidenceScore = params.confidenceScore * 0.3;
  const penalty = Math.min(0.8, params.rejectionCount * 0.2);

  return roundMetric(
    Math.max(
      0,
      topReadScore + evidenceScore + providerScore + confidenceScore - penalty,
    ),
  );
};

const technicalLeakPatterns = [
  /\bsource item\b/i,
  /\bcanonicalurl\b/i,
  /\bsource-binding\b/i,
  /\bsourcebinding\b/i,
  /\binterest:[0-9a-f-]{8,}\b/i,
  /\bprovider:[a-z0-9_-]+\b/i,
  /\bfeed_item\b/i,
  /\bsource_item\b/i,
  /\breadersummary\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
];

const collectTechnicalLeaks = (values: readonly string[]): readonly string[] =>
  unique(
    values.filter((value) =>
      technicalLeakPatterns.some((pattern) => pattern.test(value)),
    ),
  );

const distinctDefined = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Set(
    values.filter((value): value is string => value !== undefined),
  ),
];

const unique = <TValue>(values: readonly TValue[]): readonly TValue[] => [
  ...new Set(values),
];

const roundMetric = (value: number): number => Math.round(value * 1000) / 1000;
