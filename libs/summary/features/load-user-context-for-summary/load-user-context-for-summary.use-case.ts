import {
  DomainError,
  err,
  ok,
  redactSensitiveText,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  NOOP_SUMMARY_MEMORY,
  type SummaryMemoryContext,
  type SummaryMemoryPort,
} from "../../ports";
import type { LoadUserContextForSummaryQuery } from "./load-user-context-for-summary.query";
import type { LoadUserContextForSummaryResult } from "./load-user-context-for-summary.result";

type LoadUserContextForSummaryFailure = DomainError;

export class LoadUserContextForSummaryUseCase {
  constructor(
    private readonly memory: SummaryMemoryPort = NOOP_SUMMARY_MEMORY,
  ) {}

  async execute(
    query: LoadUserContextForSummaryQuery,
  ): Promise<
    Result<LoadUserContextForSummaryResult, LoadUserContextForSummaryFailure>
  > {
    if (query.interestId.trim().length === 0) {
      return err(
        new DomainError(
          "validation.failed",
          "Summary memory interest id must be non-empty",
        ),
      );
    }

    return ok({
      context: await this.safeBuildContext(query),
    });
  }

  private async safeBuildContext(
    query: LoadUserContextForSummaryQuery,
  ): Promise<SummaryMemoryContext> {
    try {
      return await this.memory.buildContext({
        ...query,
        interestId: query.interestId.trim(),
      });
    } catch (error) {
      return {
        status: "unavailable",
        diagnostics: {
          code: "summary.memory.unavailable",
          message: safeMemoryErrorMessage(error),
        },
        retrievedAt: query.requestedAt,
      };
    }
  }
}

const safeMemoryErrorMessage = (error: unknown): string => {
  const message =
    error instanceof Error
      ? error.message
      : "Summary memory context unavailable";

  return redactSensitiveText(message).slice(0, 240);
};
