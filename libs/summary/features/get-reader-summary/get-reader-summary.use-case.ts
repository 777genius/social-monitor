import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryFreshnessProbePort,
  ReaderSummaryPreviewMediaEnricherPort,
} from "../../ports";
import { NOOP_READER_SUMMARY_PREVIEW_MEDIA_ENRICHER } from "../../ports";
import {
  presentReaderSummaryArtifact,
  readerSummaryContentForArtifact,
} from "../shared/reader-summary-artifact-presenter";
import type { GetReaderSummaryQuery } from "./get-reader-summary.query";
import type { GetReaderSummaryResult } from "./get-reader-summary.result";

type GetReaderSummaryFailure = DomainError;

export class GetReaderSummaryUseCase {
  constructor(
    private readonly readerSummaries: ReaderSummaryArtifactRepositoryPort,
    private readonly freshness: ReaderSummaryFreshnessProbePort,
    private readonly previewMediaEnricher: ReaderSummaryPreviewMediaEnricherPort =
      NOOP_READER_SUMMARY_PREVIEW_MEDIA_ENRICHER,
  ) {}

  async execute(
    query: GetReaderSummaryQuery,
  ): Promise<Result<GetReaderSummaryResult, GetReaderSummaryFailure>> {
    if (query.readerSummaryId.trim().length === 0) {
      return err(
        new DomainError(
          "validation.failed",
          "Reader summary id must be non-empty",
        ),
      );
    }

    const readerSummary = await this.readerSummaries.findById(query);

    if (readerSummary === null) {
      return err(
        new DomainError("resource.not_found", "Reader summary not found", {
          readerSummaryId: query.readerSummaryId,
        }),
      );
    }

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

    return ok(
      presentReaderSummaryArtifact(readerSummary, freshness, { content }),
    );
  }
}
