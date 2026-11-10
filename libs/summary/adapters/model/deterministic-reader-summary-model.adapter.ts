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
import { buildReaderSummary, primaryReaderSummaryEvidence } from "../../domain";
import {
  assertDeterministicReaderSummaryBudget,
  estimateDeterministicReaderSummaryTokens,
} from "./deterministic-reader-summary-budget-policy";
import { buildDeterministicNoSignalReaderSummaryAttempt } from "./deterministic-reader-summary-no-signal";
import {
  selectClustersForEvidence,
  selectProviderDiverseRankedEvidence,
} from "./deterministic-reader-summary-evidence-selection";
import { buildReaderHeadline } from "./deterministic-reader-summary-headline";
import { buildDeterministicReaderSummaryNarrative } from "./deterministic-reader-summary-narrative";
import { buildExecutiveSummary } from "./deterministic-reader-summary-text";
import { buildDeterministicReaderSummaryStoryProjection } from "./deterministic-reader-summary-story-projection";

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

    assertDeterministicReaderSummaryBudget(estimate, policy, budget);

    return route;
  }

  estimate(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): ReaderSummaryModelEstimate {
    void selectedRoute;
    return estimateDeterministicReaderSummaryTokens(input);
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
    const primaryEvidence = primaryReaderSummaryEvidence(input.evidence);
    const firstItem = primaryEvidence.selectedEvidence[0];

    if (firstItem === undefined) {
      return buildDeterministicNoSignalReaderSummaryAttempt({
        input,
        selectedRoute,
        lineage,
        usage,
      });
    }

    const citedEvidence = input.evidence.selectedEvidence;
    const selectedEvidence = input.evidence.editorialSlate === undefined
      ? selectProviderDiverseRankedEvidence(
          primaryEvidence.selectedEvidence,
          input.policy.maxStories,
        )
      : primaryEvidence.selectedEvidence;
    const topStoryClusters = input.evidence.editorialSlate === undefined
      ? selectClustersForEvidence(
          input.evidence.clusters,
          selectedEvidence,
          input.policy.maxStories,
          [
            ...(input.coveragePlan.lead === undefined
              ? []
              : [input.coveragePlan.lead.clusterId]),
            ...input.coveragePlan.secondary.map((item) => item.clusterId),
          ],
        )
      : primaryEvidence.clusters;
    const { citationMap, topStories, interestHighlights, repeatedSignals } =
      buildDeterministicReaderSummaryStoryProjection({
        input,
        citedEvidence,
        selectedEvidence,
        topStoryClusters,
        firstItem,
      });

    const headlineEvidence = input.evidence.editorialSlate === undefined
      ? selectedEvidence
      : input.evidence.editorialSlate.orderedCandidateIds.flatMap(
          (candidateId) => {
            const item = input.evidence.selectedEvidence.find(
              (evidence) => evidence.feedItemId === candidateId,
            );
            return item === undefined ? [] : [item];
          },
        );
    const headline = buildReaderHeadline(input, headlineEvidence);
    const executiveSummary = buildExecutiveSummary(input);
    const narrativeSections = buildDeterministicReaderSummaryNarrative({
      input,
      executiveSummary,
      citationMap,
      topStories,
    });
    const draft = {
      headline,
      executiveSummary,
      topStories,
      interestHighlights,
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

    const content = buildReaderSummary({
      ...draft,
      narrativeSections,
      storyClusters: input.evidence.clusters,
      sourceWindow: input.evidence.sourceWindow,
      selectedEvidence: citedEvidence,
      editorialSlate: input.evidence.editorialSlate,
    });

    return {
      route: selectedRoute,
      draft: {
        ...draft,
        headline: content.headline,
        content,
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

