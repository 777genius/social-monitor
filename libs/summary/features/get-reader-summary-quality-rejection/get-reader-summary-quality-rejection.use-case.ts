import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryJobRepositoryPort,
} from "../../ports";
import type { GetReaderSummaryQualityRejectionQuery } from "./get-reader-summary-quality-rejection.query";
import type { GetReaderSummaryQualityRejectionResult } from "./get-reader-summary-quality-rejection.result";

type GetReaderSummaryQualityRejectionFailure = DomainError;

export class GetReaderSummaryQualityRejectionUseCase {
  constructor(
    private readonly readerSummaryJobs: ReaderSummaryJobRepositoryPort,
    private readonly readerSummaryArtifacts: ReaderSummaryArtifactRepositoryPort,
  ) {}

  async execute(
    query: GetReaderSummaryQualityRejectionQuery,
  ): Promise<
    Result<
      GetReaderSummaryQualityRejectionResult,
      GetReaderSummaryQualityRejectionFailure
    >
  > {
    if (query.readerSummaryJobId.trim().length === 0) {
      return err(
        new DomainError(
          "validation.failed",
          "Reader summary job id must be non-empty",
        ),
      );
    }

    const job = await this.readerSummaryJobs.findById(query);
    if (job === null) {
      return err(
        new DomainError("resource.not_found", "Reader summary job not found", {
          readerSummaryJobId: query.readerSummaryJobId,
        }),
      );
    }

    const snapshot = job.toSnapshot();
    if (
      snapshot.status !== "quality_rejected" ||
      snapshot.readerSummaryId === undefined
    ) {
      return err(
        new DomainError(
          "validation.failed",
          "Reader summary job has no quality rejection diagnostic",
          { status: snapshot.status },
        ),
      );
    }

    const debug = await this.readerSummaryArtifacts.findRejectedDebugById({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      readerSummaryId: snapshot.readerSummaryId,
    });
    if (debug === null) {
      return err(
        new DomainError(
          "resource.not_found",
          "Reader summary quality rejection diagnostic not found",
          { readerSummaryId: snapshot.readerSummaryId },
        ),
      );
    }

    return ok({
      readerSummaryJobId: snapshot.id,
      readerSummaryId: debug.readerSummaryId,
      scope: debug.scope,
      period: debug.period,
      headline: debug.headline,
      failureClass: "quality_rejected",
      canonicalScore: debug.canonicalScore,
      shadow: debug.shadow,
      reasonCodes: debug.reasonCodes,
      reasons: debug.reasons,
      violations: debug.violations,
      topReads: debug.topReads,
      citations: debug.citations,
    });
  }
}
