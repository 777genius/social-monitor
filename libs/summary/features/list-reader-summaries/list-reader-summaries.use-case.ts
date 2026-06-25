import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import { assertReaderSummaryScope } from "../../domain";
import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryFreshnessProbePort,
} from "../../ports";
import { presentReaderSummaryArtifact } from "../shared/reader-summary-artifact-presenter";
import type { ListReaderSummariesQuery } from "./list-reader-summaries.query";
import type { ListReaderSummariesResult } from "./list-reader-summaries.result";

type ListReaderSummariesFailure = DomainError;

const MAX_LIMIT = 100;

export class ListReaderSummariesUseCase {
  constructor(
    private readonly readerSummaries: ReaderSummaryArtifactRepositoryPort,
    private readonly freshness: ReaderSummaryFreshnessProbePort,
  ) {}

  async execute(
    query: ListReaderSummariesQuery,
  ): Promise<Result<ListReaderSummariesResult, ListReaderSummariesFailure>> {
    if (
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > MAX_LIMIT
    ) {
      return err(
        new DomainError(
          "validation.failed",
          "Reader summary page limit must be between 1 and 100",
          {
            limit: query.limit,
          },
        ),
      );
    }

    if (query.scope !== undefined) {
      try {
        assertReaderSummaryScope(query.scope);
      } catch (error) {
        return err(
          new DomainError(
            "validation.failed",
            error instanceof Error
              ? error.message
              : "Invalid reader summary scope",
          ),
        );
      }
    }

    const result = await this.readerSummaries.list(query);
    const items = await Promise.all(
      result.items.map(async (readerSummary) => {
        const snapshot = readerSummary.toSnapshot();
        const freshness = await this.freshness.evaluate({
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          scope: snapshot.scope,
          sourceWindow: snapshot.sourceWindow,
        });

        return presentReaderSummaryArtifact(readerSummary, freshness);
      }),
    );

    return ok({
      items,
      nextCursor: result.nextCursor,
    });
  }
}
