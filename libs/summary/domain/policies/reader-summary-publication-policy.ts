import type {
  ReaderSummaryArtifact,
  ReaderSummaryContent,
} from "../entities/reader-summary-artifact";
import type { SummaryEvidenceSelection } from "../value-objects/summary-evidence-item";
import type { ReaderSummaryCitation } from "../entities/citation";
import { readerSummaryIndependentProviderFamilyCount } from "../value-objects/reader-summary-provider-identity";
import {
  buildReaderSummaryCoveragePlan,
  type ReaderSummaryCoveragePlan,
} from "../services/reader-summary-coverage-plan";
import { evaluateReaderSummaryArtifactEditorialQuality } from "./reader-summary-artifact-editorial-quality-policy";
import { primaryReaderSummaryEvidence } from "./reader-summary-github-trending-policy";
import { isGitHubReaderItem } from "./reader-summary-github-projection-audit";
import type {
  ReaderSummaryPublicationDecision,
  ReaderSummaryPublicationRejectionFinding,
} from "./reader-summary-publication-decision";
import { publicationShadowReport } from "./reader-summary-publication-shadow";
import { promotionPublicationFindings } from "./reader-summary-promotion-publication-verification";
import { readerSummaryPromotionPublicationOracle } from "./reader-summary-promotion-publication-oracle";

import {
  collectReaderSummaryTechnicalLeaks,
  collectReaderSummaryUserFacingTechnicalLeaks,
} from "./reader-summary-publication-technical-leaks";
export { collectReaderSummaryUserFacingTechnicalLeaks } from "./reader-summary-publication-technical-leaks";
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
    readonly editorialEvidence?: SummaryEvidenceSelection;
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
      ...collectReaderSummaryTechnicalLeaks([
        snapshot.headline,
        snapshot.executiveSummary,
      ]),
      ...(snapshot.content === undefined
        ? []
        : collectReaderSummaryUserFacingTechnicalLeaks(snapshot.content)),
    ]);
    const topReads = topReadReferences(snapshot);
    const shadow = publicationShadowReport(params);
    const rejectionFindings: ReaderSummaryPublicationRejectionFinding[] = [];

    const verification = readerSummaryPromotionPublicationOracle({
      evidence: params.evidence.selectedEvidence,
      citations: independentPromotionCitations(
        params.evidence.selectedEvidence,
        snapshot.citationMap,
      ),
      sourceWindow: params.evidence.sourceWindow,
      clusters: params.evidence.clusters,
      approvedSameStoryRelations: params.evidence.approvedSameStoryRelations,
      relatedTopicRelations: params.evidence.relatedTopicRelations,
    });
    rejectionFindings.push(
      ...promotionPublicationFindings({
        expectedTop: verification.top,
        expectedAdditional: verification.additional,
        actualTop: snapshot.content?.topReads ?? [],
        actualSelected: (snapshot.content?.selectedPosts ?? []).filter(
          (item) => !isGitHubReaderItem(item),
        ),
      }),
    );

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
        primaryReaderSummaryEvidence(
          params.editorialEvidence ?? params.evidence,
        ),
      );
      const editorialQuality = evaluateReaderSummaryArtifactEditorialQuality(
        editorialQualityInput(snapshot, coveragePlan.mode),
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
      }
    }

    const canonicalScore = canonicalPublicationScore({
      topReadCount: topReads.length,
      rejectionCount: rejectionFindings.length,
      confidenceScore: snapshot.confidence.score,
      selectedEvidenceCount: params.evidence.selectedEvidence.length,
      providerCount: readerSummaryIndependentProviderFamilyCount(
        params.evidence.selectedEvidence.map((item) => item.providerKey),
      ),
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

const independentPromotionCitations = (
  evidence: SummaryEvidenceSelection["selectedEvidence"],
  citations: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryCitation[] =>
  evidence.map((item) => {
    const citation = [...citations]
      .sort((left, right) => left.citationId.localeCompare(right.citationId))
      .find(
        (candidate) =>
          candidate.feedItemId === item.feedItemId &&
          candidate.sourceItemId === item.sourceItemId &&
          candidate.providerKey === item.providerKey &&
          (candidate.canonicalUrl === undefined ||
            candidate.canonicalUrl === item.canonicalUrl),
      );
    return (
      citation ?? {
        citationId: `publication-expected:${item.feedItemId}`,
        feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId,
        providerKey: item.providerKey,
        field: "canonicalUrl",
        canonicalUrl: item.canonicalUrl,
      }
    );
  });

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
          (citationId) => clusterIdForCitation(citationId) !== sectionClusterId,
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
        () =>
          "Main narrative cites a story outside the deterministic coverage plan",
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

const distinctDefined = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Set(values.filter((value): value is string => value !== undefined)),
];

const unique = <TValue>(values: readonly TValue[]): readonly TValue[] => [
  ...new Set(values),
];

const roundMetric = (value: number): number => Math.round(value * 1000) / 1000;
