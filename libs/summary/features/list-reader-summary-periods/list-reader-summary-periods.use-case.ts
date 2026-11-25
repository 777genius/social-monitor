import {
  err,
  ok,
  type DomainError,
  type Result,
} from "@social-monitor/shared-kernel";

import type { ReaderSummaryArtifactRepositoryPort } from "../../ports";
import { validateReaderSummaryListQuery } from "../shared/reader-summary-list-query-validation";
import type { ListReaderSummaryPeriodsQuery } from "./list-reader-summary-periods.query";
import type { ListReaderSummaryPeriodsResult } from "./list-reader-summary-periods.result";

type ListReaderSummaryPeriodsFailure = DomainError;

export class ListReaderSummaryPeriodsUseCase {
  constructor(
    private readonly readerSummaries: ReaderSummaryArtifactRepositoryPort,
  ) {}

  async execute(
    query: ListReaderSummaryPeriodsQuery,
  ): Promise<
    Result<ListReaderSummaryPeriodsResult, ListReaderSummaryPeriodsFailure>
  > {
    const validation = validateReaderSummaryListQuery(query);
    if (!validation.ok) {
      return err(validation.error);
    }

    const result = await this.readerSummaries.listPeriodSummaries(query);

    return ok({
      items: result.items,
      nextCursor: result.nextCursor,
    });
  }
}
