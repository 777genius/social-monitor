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
import { primaryReaderSummaryEvidence } from "../../domain";
import {
  assertDeterministicReaderSummaryBudget,
  estimateDeterministicReaderSummaryTokens,
} from "./deterministic-reader-summary-budget-policy";
import { buildDeterministicNoSignalReaderSummaryAttempt } from "./deterministic-reader-summary-no-signal";
import { selectDeterministicReaderSummaryCoverage } from "./deterministic-reader-summary-coverage-selection";
import { buildDeterministicReaderSummaryStoryProjection } from "./deterministic-reader-summary-story-projection";
import { buildDeterministicReaderSummaryDocument } from "./deterministic-reader-summary-document";

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
    const { selectedEvidence, topStoryClusters } =
      selectDeterministicReaderSummaryCoverage(input, primaryEvidence);
    const projection =
      buildDeterministicReaderSummaryStoryProjection({
        input,
        citedEvidence,
        selectedEvidence,
        topStoryClusters,
        firstItem,
      });

    return buildDeterministicReaderSummaryDocument({
      input,
      selectedRoute,
      selectedEvidence,
      citedEvidence,
      projection,
      lineage,
      usage,
    });
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

