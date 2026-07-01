import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  assertReaderSummaryCadence,
  assertReaderSummaryScope,
  type ReaderSummaryArtifact,
} from "../../domain";
import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryFreshnessProbePort,
  ReaderSummaryPreviewMediaEnricherPort,
} from "../../ports";
import { NOOP_READER_SUMMARY_PREVIEW_MEDIA_ENRICHER } from "../../ports";
import {
  presentReaderSummaryArtifact,
  readerSummaryContentForArtifact,
  type ReaderSummaryArtifactView,
} from "../shared/reader-summary-artifact-presenter";
import type { ListReaderSummariesQuery } from "./list-reader-summaries.query";
import type { ListReaderSummariesResult } from "./list-reader-summaries.result";

type ListReaderSummariesFailure = DomainError;

const MAX_LIMIT = 100;
const MAX_FILTERED_SCAN_PAGES = 25;

export class ListReaderSummariesUseCase {
  constructor(
    private readonly readerSummaries: ReaderSummaryArtifactRepositoryPort,
    private readonly freshness: ReaderSummaryFreshnessProbePort,
    private readonly previewMediaEnricher: ReaderSummaryPreviewMediaEnricherPort =
      NOOP_READER_SUMMARY_PREVIEW_MEDIA_ENRICHER,
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

    const periodValidation = validateReaderSummaryPeriodFilters(query);
    if (!periodValidation.ok) {
      return err(periodValidation.error);
    }

    const filters = normalizeListReaderSummaryFilters(query);
    if (!filters.ok) {
      return err(filters.error);
    }

    const result = hasPostPresentationFilters(filters.value)
      ? await this.listWithPostPresentationFilters(query, filters.value)
      : await this.listSinglePage(query);

    return ok({
      items: result.items,
      nextCursor: result.nextCursor,
    });
  }

  private async listSinglePage(query: ListReaderSummariesQuery): Promise<{
    readonly items: readonly ReaderSummaryArtifactView[];
    readonly nextCursor?: string;
  }> {
    const result = await this.readerSummaries.list(query);
    const items = await Promise.all(
      result.items.map((readerSummary) => this.present(readerSummary)),
    );

    return {
      items,
      nextCursor: result.nextCursor,
    };
  }

  private async listWithPostPresentationFilters(
    query: ListReaderSummariesQuery,
    filters: NormalizedListReaderSummaryFilters,
  ): Promise<{
    readonly items: readonly ReaderSummaryArtifactView[];
    readonly nextCursor?: string;
  }> {
    const items: ReaderSummaryArtifactView[] = [];
    let cursor = query.cursor;
    let nextCursor: string | undefined;

    for (
      let page = 0;
      page < MAX_FILTERED_SCAN_PAGES && items.length < query.limit;
      page += 1
    ) {
      const remaining = query.limit - items.length;
      const result = await this.readerSummaries.list({
        ...query,
        limit: remaining,
        cursor,
      });
      nextCursor = result.nextCursor;

      if (result.items.length === 0) {
        break;
      }

      const presentedItems = await Promise.all(
        result.items.map((readerSummary) => this.present(readerSummary)),
      );
      for (const item of presentedItems) {
        if (matchesListReaderSummaryFilters(item, filters)) {
          items.push(item);
        }
      }

      if (nextCursor === undefined) {
        break;
      }

      cursor = nextCursor;
    }

    return {
      items,
      nextCursor,
    };
  }

  private async present(
    readerSummary: ReaderSummaryArtifact,
  ): Promise<ReaderSummaryArtifactView> {
    const snapshot = readerSummary.toSnapshot();
    const freshness = await this.freshness.evaluate({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      sourceWindow: snapshot.sourceWindow,
    });

    const content = await this.previewMediaEnricher.enrich({
      artifact: readerSummary,
      content: readerSummaryContentForArtifact(readerSummary),
    });

    return presentReaderSummaryArtifact(readerSummary, freshness, { content });
  }
}

type NormalizedListReaderSummaryFilters = {
  readonly providerKey?: string;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly freshnessStatus?: "fresh" | "stale";
  readonly memoryGuidanceApplied?: boolean;
};

const normalizeListReaderSummaryFilters = (
  query: ListReaderSummariesQuery,
): Result<NormalizedListReaderSummaryFilters, DomainError> => {
  if (
    query.freshnessStatus !== undefined &&
    query.freshnessStatus !== "fresh" &&
    query.freshnessStatus !== "stale"
  ) {
    return err(
      new DomainError(
        "validation.failed",
        "Reader summary freshnessStatus must be fresh or stale",
      ),
    );
  }

  return ok({
    providerKey: normalizeOptionalFilter(query.providerKey),
    userId: normalizeOptionalFilter(query.userId),
    subscriptionId: normalizeOptionalFilter(query.subscriptionId),
    freshnessStatus: query.freshnessStatus,
    memoryGuidanceApplied: query.memoryGuidanceApplied,
  });
};

const normalizeOptionalFilter = (
  value: string | undefined,
): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

const validateReaderSummaryPeriodFilters = (
  query: ListReaderSummariesQuery,
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

const hasPostPresentationFilters = (
  filters: NormalizedListReaderSummaryFilters,
): boolean =>
  filters.providerKey !== undefined ||
  filters.userId !== undefined ||
  filters.subscriptionId !== undefined ||
  filters.freshnessStatus !== undefined ||
  filters.memoryGuidanceApplied !== undefined;

const matchesListReaderSummaryFilters = (
  item: ReaderSummaryArtifactView,
  filters: NormalizedListReaderSummaryFilters,
): boolean => {
  if (filters.userId !== undefined && item.userId !== filters.userId) {
    return false;
  }

  if (
    filters.subscriptionId !== undefined &&
    item.subscriptionId !== filters.subscriptionId
  ) {
    return false;
  }

  if (
    filters.freshnessStatus !== undefined &&
    item.freshness.status !== filters.freshnessStatus
  ) {
    return false;
  }

  if (
    filters.memoryGuidanceApplied !== undefined &&
    (item.personalization?.memoryGuidanceApplied === true) !==
      filters.memoryGuidanceApplied
  ) {
    return false;
  }

  const providerKey = filters.providerKey;

  return (
    providerKey === undefined ||
    item.storyClusters.some((cluster) =>
      cluster.providerKeys.includes(providerKey),
    ) ||
    item.citations.some((citation) => citation.providerKey === providerKey) ||
    item.coverage.topProviderKeys.includes(providerKey)
  );
};
