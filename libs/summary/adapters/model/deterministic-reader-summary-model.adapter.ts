import type {
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelFailure,
  ReaderSummaryModelInput,
  ReaderSummaryModelPolicy,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
  ReaderSummaryModelValidationResult,
  ProviderReaderSummaryAttempt,
} from "../../ports";
import { buildReaderSummary } from "../../domain";
import { buildReaderHeadline } from "./deterministic-reader-summary-headline";

const route: ReaderSummaryModelRoute = {
  provider: "deterministic-local",
  model: "deterministic-reader-summary-v1",
  promptVersion: "reader_summary.prompt.v1",
  schemaVersion: "reader_summary.artifact.v1",
};

export class DeterministicReaderSummaryModelAdapter implements ReaderSummaryModelPort {
  route(
    input: ReaderSummaryModelInput,
    policy: ReaderSummaryModelPolicy,
    budget: ReaderSummaryModelBudget,
  ): ReaderSummaryModelRoute {
    const estimate = this.estimate(input, route);

    if (
      estimate.inputTokens > policy.maxInputTokens ||
      estimate.outputTokens > policy.maxOutputTokens ||
      estimate.estimatedCostUsd > policy.maxEstimatedCostUsd ||
      estimate.inputTokens + estimate.outputTokens > budget.remainingTokens ||
      estimate.estimatedCostUsd > budget.remainingCostUsd
    ) {
      throw new Error("Reader summary model budget exceeded");
    }

    return route;
  }

  estimate(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): ReaderSummaryModelEstimate {
    void selectedRoute;

    const evidenceTextLength = input.evidence.selectedEvidence.reduce(
      (total, item) =>
        total + item.title.length + (item.bodyPreview?.length ?? 0),
      0,
    );
    const contextTextLength = input.contextArtifacts.reduce(
      (total, artifact) => total + artifact.summaryText.length,
      0,
    );
    const inputTokens = Math.ceil((evidenceTextLength + contextTextLength) / 4);
    const outputTokens =
      input.evidence.selectedEvidence.length === 0 ? 64 : 260;

    return {
      inputTokens,
      outputTokens,
      estimatedCostUsd: 0,
    };
  }

  async generate(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    const usage = this.estimate(input, selectedRoute);
    const lineage = {
      promptVersion: selectedRoute.promptVersion,
      schemaVersion: selectedRoute.schemaVersion,
      modelVersion: selectedRoute.model,
      providerVersion: selectedRoute.provider,
      rulesVersion: input.policy.rulesVersion,
      evalDatasetVersion: "reader_summary.eval.mvp.v1",
      rankingPolicyVersion: input.evidence.rankingPolicyVersion,
    } as const;
    const firstItem = input.evidence.selectedEvidence[0];

    if (firstItem === undefined) {
      const noSignalDraft = {
        headline: "No reliable workspace signal yet",
        executiveSummary:
          "No eligible feed items were available for this summary window.",
        topStories: [],
        topicHighlights: [],
        repeatedSignals: [],
        risksAndUnknowns: [
          {
            description:
              "The summary window did not contain enough primary evidence to produce claims.",
            reason: "insufficient_evidence" as const,
          },
        ],
        citationMap: [],
        qualityFlags: ["no_signal", "limited_sources"] as const,
        confidence: {
          level: "none" as const,
          score: 0,
          rationale: "No primary evidence was selected for the summary window.",
        },
        lineage,
        usage,
        noSignalReason:
          "No eligible evidence items selected for this summary scope.",
      };

      return {
        route: selectedRoute,
        draft: {
          ...noSignalDraft,
          content: buildReaderSummary({
            ...noSignalDraft,
            storyClusters: input.evidence.clusters,
            selectedEvidence: input.evidence.selectedEvidence,
          }),
        },
      };
    }

    const selectedEvidence = selectProviderDiverseEvidence(
      input.evidence.selectedEvidence,
      input.policy.maxStories,
    );
    const citationMap = selectedEvidence.map((item, index) => ({
      citationId: `c${index + 1}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: item.providerKey,
      field: "title" as const,
      canonicalUrl: item.canonicalUrl,
    }));
    const topStoryClusters = selectClustersForEvidence(
      input.evidence.clusters,
      selectedEvidence,
      input.policy.maxStories,
    );
    const topStories = topStoryClusters.map((cluster, index) => {
      const representative =
        selectedEvidence.find(
          (item) => item.feedItemId === cluster.representativeFeedItemId,
        ) ??
        selectedEvidence[index] ??
        firstItem;
      const citationId =
        citationMap.find(
          (citation) => citation.feedItemId === representative.feedItemId,
        )?.citationId ?? "c1";

      return {
        storyClusterId: cluster.id,
        title: representative.title,
        summary: buildStorySummary(
          representative.title,
          cluster.topicIds,
          cluster.providerKeys,
        ),
        topicIds: cluster.topicIds,
        providerKeys: cluster.providerKeys,
        citationIds: [citationId],
      };
    });
    const topicHighlights = input.policy.includeTopicHighlights
      ? buildTopicHighlights(selectedEvidence, citationMap)
      : [];
    const repeatedSignals = input.policy.includeRepeatedSignals
      ? input.evidence.clusters
          .filter((cluster) => cluster.topicIds.length >= 2)
          .slice(0, 5)
          .map((cluster) => {
            const representative =
              selectedEvidence.find(
                (item) => item.feedItemId === cluster.representativeFeedItemId,
              ) ?? firstItem;
            const citationId =
              citationMap.find(
                (citation) => citation.feedItemId === representative.feedItemId,
              )?.citationId ?? "c1";

            return {
              storyClusterId: cluster.id,
              title: representative.title,
              topicIds: cluster.topicIds,
              citationIds: [citationId],
            };
          })
      : [];

    const draft = {
      headline: buildReaderHeadline(input, selectedEvidence),
      executiveSummary: buildExecutiveSummary(input),
      topStories,
      topicHighlights,
      repeatedSignals,
      risksAndUnknowns: input.policy.includeRisks
        ? [
            {
              description:
                "This deterministic reader summary only uses selected primary evidence titles.",
              citationIds: ["c1"],
              reason: "source_limit" as const,
            },
          ]
        : [],
      citationMap,
      qualityFlags:
        selectedEvidence.length < 3 ? ["limited_sources" as const] : [],
      confidence: {
        level:
          selectedEvidence.length < 3 ? ("low" as const) : ("medium" as const),
        score: selectedEvidence.length < 3 ? 0.35 : 0.65,
        rationale:
          "Confidence is derived from selected primary evidence count in this deterministic adapter.",
      },
      lineage,
      usage,
    };

    return {
      route: selectedRoute,
      draft: {
        ...draft,
        content: buildReaderSummary({
          ...draft,
          storyClusters: input.evidence.clusters,
          selectedEvidence,
        }),
      },
    };
  }

  validateRawProviderResponse(
    attempt: ProviderReaderSummaryAttempt,
  ): ReaderSummaryModelValidationResult {
    if (attempt.route.schemaVersion !== "reader_summary.artifact.v1") {
      return {
        ok: false,
        failure: {
          kind: "invalid_schema",
          retryable: false,
          message: "Unsupported reader summary schema version",
        },
      };
    }

    return { ok: true };
  }

  classifyError(error: unknown): ReaderSummaryModelFailure {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown reader summary model error";

    if (message.toLowerCase().includes("budget")) {
      return {
        kind: "budget_exceeded",
        retryable: false,
        message,
      };
    }

    if (message.toLowerCase().includes("citation")) {
      return {
        kind: "citation_validation_failed",
        retryable: false,
        message,
      };
    }

    return {
      kind: "unknown",
      retryable: false,
      message,
    };
  }
}

const buildExecutiveSummary = (input: ReaderSummaryModelInput): string => {
  const formatLabel = summaryFormatLabel(input.policy.format);
  const toneLabel = input.policy.tone;
  const scopeLabel =
    input.scope.type === "workspace"
      ? "workspace"
      : `topic ${input.scope.topicId}`;
  const repeatedCount = input.evidence.clusters.filter(
    (cluster) => cluster.topicIds.length >= 2,
  ).length;
  const storyCount = input.evidence.selectedEvidence.length;
  const base = `Current ${formatLabel} covers ${storyCount} selected ${storyCount === 1 ? "story" : "stories"} for ${scopeLabel} in ${articleFor(toneLabel)} ${toneLabel} tone.`;
  const repeated =
    repeatedCount === 0
      ? "No repeated cross-topic signals were detected."
      : `${repeatedCount} repeated cross-topic ${repeatedCount === 1 ? "signal was" : "signals were"} detected.`;

  if (input.policy.customInstructions === undefined) {
    return `${base} ${repeated}`;
  }

  return `${base} ${repeated} Custom focus: ${input.policy.customInstructions}`;
};

const summaryFormatLabel = (format: string): string => {
  if (format === "executive_brief") {
    return "executive summary";
  }
  const label = format.split("_").join(" ");
  return label.includes("summary") ? label : `${label} summary`;
};

const articleFor = (word: string): "a" | "an" =>
  /^[aeiou]/i.test(word) ? "an" : "a";

const buildStorySummary = (
  title: string,
  topicIds: readonly string[],
  providerKeys: readonly string[],
): string =>
  `${title} appeared across ${topicIds.length} topic(s) and ${providerKeys.length} provider(s).`;

const buildTopicHighlights = (
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
  citationMap: ProviderReaderSummaryAttempt["draft"]["citationMap"],
) => {
  const firstByTopic = new Map<
    string,
    ReaderSummaryModelInput["evidence"]["selectedEvidence"][number]
  >();
  for (const item of selectedEvidence) {
    if (!firstByTopic.has(item.topicId)) {
      firstByTopic.set(item.topicId, item);
    }
  }

  return [...firstByTopic.entries()].slice(0, 8).map(([topicId, item]) => ({
    topicId,
    title: item.title,
    summary: item.whyImportant[0] ?? "Selected as a relevant summary signal.",
    citationIds: [
      citationMap.find((citation) => citation.feedItemId === item.feedItemId)
        ?.citationId ?? "c1",
    ],
  }));
};

const selectProviderDiverseEvidence = (
  evidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
  limit: number,
): ReaderSummaryModelInput["evidence"]["selectedEvidence"] => {
  const normalizedLimit = normalizeStoryLimit(limit);

  if (evidence.length <= normalizedLimit) {
    return evidence;
  }

  const selected: ReaderSummaryModelInput["evidence"]["selectedEvidence"][number][] =
    [];
  const selectedIds = new Set<string>();
  const providerKeys = uniqueStable(evidence.map((item) => item.providerKey));

  for (const providerKey of providerKeys) {
    if (selected.length >= normalizedLimit) {
      break;
    }

    const providerItem = evidence.find(
      (item) => item.providerKey === providerKey,
    );
    if (providerItem !== undefined) {
      selected.push(providerItem);
      selectedIds.add(providerItem.feedItemId);
    }
  }

  for (const item of evidence) {
    if (selected.length >= normalizedLimit) {
      break;
    }

    if (selectedIds.has(item.feedItemId)) {
      continue;
    }

    selected.push(item);
    selectedIds.add(item.feedItemId);
  }

  return selected;
};

const selectClustersForEvidence = (
  clusters: ReaderSummaryModelInput["evidence"]["clusters"],
  evidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
  limit: number,
): ReaderSummaryModelInput["evidence"]["clusters"] => {
  const normalizedLimit = normalizeStoryLimit(limit);
  const clusterByRepresentative = new Map(
    clusters.map(
      (cluster) => [cluster.representativeFeedItemId, cluster] as const,
    ),
  );
  const selectedClusters = evidence
    .map((item) => clusterByRepresentative.get(item.feedItemId))
    .filter(
      (
        cluster,
      ): cluster is ReaderSummaryModelInput["evidence"]["clusters"][number] =>
        cluster !== undefined,
    );
  const selectedClusterIds = new Set(
    selectedClusters.map((cluster) => cluster.id),
  );

  for (const cluster of clusters) {
    if (selectedClusters.length >= normalizedLimit) {
      break;
    }

    if (selectedClusterIds.has(cluster.id)) {
      continue;
    }

    selectedClusters.push(cluster);
    selectedClusterIds.add(cluster.id);
  }

  return selectedClusters.slice(0, normalizedLimit);
};

const normalizeStoryLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    return 1;
  }

  return Math.min(limit, 20);
};

const uniqueStable = <T>(values: readonly T[]): readonly T[] => {
  const seen = new Set<T>();
  const result: T[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
};
