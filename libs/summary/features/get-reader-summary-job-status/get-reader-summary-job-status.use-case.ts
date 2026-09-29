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
    const recoveryPending = snapshot.selectionStrategy === "jev_primary_v3" &&
      snapshot.status === "failed" && snapshot.terminalFailureCode === undefined &&
      snapshot.failureReason === "v3_retryable_provider_rate_limited";
    const publicStatus = recoveryPending ? "requested" : snapshot.status;
    const publicFailureReason = snapshot.failureReason?.startsWith("v3_") ||
      recoveryPending ? undefined : snapshot.failureReason;

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
      status: publicStatus,
      requestedAt: snapshot.requestedAt.toISOString(),
      startedAt: recoveryPending ? undefined : snapshot.startedAt?.toISOString(),
      completedAt: snapshot.completedAt?.toISOString(),
      failedAt: recoveryPending ? undefined : snapshot.failedAt?.toISOString(),
      readerSummaryId: snapshot.readerSummaryId,
      failureReason: publicFailureReason,
      failureClass: failureClassFor(publicStatus),
      timeline: buildTimeline(snapshot, recoveryPending, publicFailureReason),
    });
  }
}

const buildTimeline = (
  snapshot: ReaderSummaryJobProps,
  recoveryPending: boolean,
  publicFailureReason?: string,
): readonly ReaderSummaryJobTimelineEvent[] => {
  const events: ReaderSummaryJobTimelineEvent[] = [
    {
      status: "requested",
      occurredAt: snapshot.requestedAt.toISOString(),
      message: "Reader summary requested",
    },
  ];

  if (!recoveryPending) pushIfPresent(
    events, "running", snapshot.startedAt, "Reader summary generation started");
  pushIfPresent(
    events,
    snapshot.status,
    snapshot.completedAt,
    messageForCompletedStatus(snapshot.status),
  );
  pushIfPresent(
    events,
    snapshot.status === "quality_rejected" ? "quality_rejected" : "failed",
    recoveryPending ? undefined : snapshot.failedAt,
    messageForFailedStatus(snapshot, publicFailureReason),
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

const messageForFailedStatus = (snapshot: ReaderSummaryJobProps,
  publicFailureReason?: string): string =>
  snapshot.status === "quality_rejected"
    ? "Reader summary rejected by pre-publish quality gate"
    : (publicFailureReason ?? "Reader summary generation failed");

const failureClassFor = (
  status: ReaderSummaryJobStatus,
): "quality_rejected" | "system_failure" | undefined => {
  if (status === "quality_rejected") {
    return "quality_rejected";
  }

  if (status === "failed") {
    return "system_failure";
  }

  return undefined;
};
