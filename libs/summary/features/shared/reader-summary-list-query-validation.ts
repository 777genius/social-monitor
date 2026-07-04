import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  assertReaderSummaryCadence,
  assertReaderSummaryScope,
  type ReaderSummaryCadence,
  type ReaderSummaryScope,
} from "../../domain";

export type ReaderSummaryListQueryValidationInput = {
  readonly scope?: ReaderSummaryScope;
  readonly cadence?: ReaderSummaryCadence;
  readonly periodStartedAt?: Date;
  readonly periodStartedFrom?: Date;
  readonly periodStartedBefore?: Date;
  readonly periodEndedAt?: Date;
  readonly limit: number;
};

export const validateReaderSummaryListQuery = (
  query: ReaderSummaryListQueryValidationInput,
): Result<void, DomainError> => {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
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

  if (query.cadence !== undefined) {
    try {
      assertReaderSummaryCadence(query.cadence);
    } catch (error) {
      return err(
        new DomainError(
          "validation.failed",
          error instanceof Error
            ? error.message
            : "Invalid reader summary cadence",
        ),
      );
    }
  }

  return validateReaderSummaryPeriodFilters(query);
};

const validateReaderSummaryPeriodFilters = (
  query: ReaderSummaryListQueryValidationInput,
): Result<void, DomainError> => {
  if (
    query.periodStartedAt !== undefined &&
    Number.isNaN(query.periodStartedAt.getTime())
  ) {
    return err(
      new DomainError(
        "validation.failed",
        "Reader summary periodStartedAt must be a valid ISO date",
      ),
    );
  }

  if (
    query.periodEndedAt !== undefined &&
    Number.isNaN(query.periodEndedAt.getTime())
  ) {
    return err(
      new DomainError(
        "validation.failed",
        "Reader summary periodEndedAt must be a valid ISO date",
      ),
    );
  }

  if (
    query.periodStartedFrom !== undefined &&
    Number.isNaN(query.periodStartedFrom.getTime())
  ) {
    return err(
      new DomainError(
        "validation.failed",
        "Reader summary periodStartedFrom must be a valid ISO date",
      ),
    );
  }

  if (
    query.periodStartedBefore !== undefined &&
    Number.isNaN(query.periodStartedBefore.getTime())
  ) {
    return err(
      new DomainError(
        "validation.failed",
        "Reader summary periodStartedBefore must be a valid ISO date",
      ),
    );
  }

  return ok(undefined);
};
