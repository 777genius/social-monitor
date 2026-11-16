import { projectDeterministicReaderSummaryAttempt } from "./deterministic-reader-summary-generation";
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
import {
  assertDeterministicReaderSummaryBudget,
  estimateDeterministicReaderSummaryTokens,
} from "./deterministic-reader-summary-budget-policy";
import {
  classifyDeterministicReaderSummaryError,
  validateDeterministicReaderSummaryProviderResponse,
} from "./deterministic-reader-summary-outcome-policy";

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
    return projectDeterministicReaderSummaryAttempt({
      input, selectedRoute, usage: this.estimate(input, selectedRoute),
    });
  }


  validateRawProviderResponse(
    attempt: ProviderReaderSummaryAttempt,
  ): ReaderSummaryModelValidationResult {
    return validateDeterministicReaderSummaryProviderResponse(attempt);
  }

  classifyError(error: unknown): ReaderSummaryModelFailure {
    return classifyDeterministicReaderSummaryError(error);
  }
}

