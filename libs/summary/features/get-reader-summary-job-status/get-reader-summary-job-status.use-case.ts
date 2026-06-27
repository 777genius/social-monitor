import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryJobProps,
  ReaderSummaryJobStatus,
} from "../../domain";
import type { ReaderSummaryJobRepositoryPort } from "../../ports";
import type { GetReaderSummaryJobStatusQuery } from "./get-reader-summary-job-status.query";
import type {
  GetReaderSummaryJobStatusResult,
  ReaderSummaryJobTimelineEvent,
} from "./get-reader-summary-job-status.result";

type GetReaderSummaryJobStatusFailure = DomainError;

export class GetReaderSummaryJobStatusUseCase {
  constructor(
    private readonly readerSummaryJobs: ReaderSummaryJobRepositoryPort,
  ) {}

  async execute(
    query: GetReaderSummaryJobStatusQuery,
  ): Promise<
    Result<GetReaderSummaryJobStatusResult, GetReaderSummaryJobStatusFailure>
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

    return ok({
      readerSummaryJobId: snapshot.id,
      scope: snapshot.scope,
      period: {
        cadence: snapshot.period.cadence,
        startedAt: snapshot.period.startedAt.toISOString(),
        endedAt: snapshot.period.endedAt.toISOString(),
        timezone: snapshot.period.timezone,
        periodKey: snapshot.period.periodKey,
      },
      status: snapshot.status,
      requestedAt: snapshot.requestedAt.toISOString(),
      startedAt: snapshot.startedAt?.toISOString(),
      completedAt: snapshot.completedAt?.toISOString(),
      failedAt: snapshot.failedAt?.toISOString(),
      readerSummaryId: snapshot.readerSummaryId,
      failureReason: snapshot.failureReason,
      timeline: buildTimeline(snapshot),
    });
  }
}

const buildTimeline = (
  snapshot: ReaderSummaryJobProps,
): readonly ReaderSummaryJobTimelineEvent[] => {
  const events: ReaderSummaryJobTimelineEvent[] = [
    {
      status: "requested",
      occurredAt: snapshot.requestedAt.toISOString(),
      message: "Reader summary requested",
    },
  ];

  pushIfPresent(
    events,
    "running",
    snapshot.startedAt,
    "Reader summary generation started",
  );
  pushIfPresent(
    events,
    snapshot.status,
    snapshot.completedAt,
    messageForCompletedStatus(snapshot.status),
  );
  pushIfPresent(
    events,
    "failed",
    snapshot.failedAt,
    snapshot.failureReason ?? "Reader summary generation failed",
  );

  return events;
};

const pushIfPresent = (
  events: ReaderSummaryJobTimelineEvent[],
  status: ReaderSummaryJobStatus,
  occurredAt: Date | undefined,
  message: string,
): void => {
  if (occurredAt !== undefined) {
    events.push({
      status,
      occurredAt: occurredAt.toISOString(),
      message,
    });
  }
};

const messageForCompletedStatus = (status: ReaderSummaryJobStatus): string =>
  status === "no_signal"
    ? "Reader summary completed with no reliable signal"
    : "Reader summary completed";
