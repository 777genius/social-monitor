import {
  DomainError,
  err,
  ok,
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
    if (query.topicId.trim().length === 0) {
      return err(
        new DomainError(
          "validation.failed",
          "Summary memory topic id must be non-empty",
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
        topicId: query.topicId.trim(),
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

  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /([?&](?:token|api_key|apikey|secret|password)=)[^&\s]+/gi,
      "$1[REDACTED]",
    )
    .slice(0, 240);
};
