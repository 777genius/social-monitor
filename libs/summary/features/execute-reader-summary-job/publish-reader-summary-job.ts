import {
  type Clock,
  causationId,
  correlationId,
  DomainError,
  eventId,
  type IdGenerator,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryArtifact,
  ReaderSummaryGitHubProjectionAudit,
  ReaderSummaryJob,
  ReaderSummaryReadyEvent,
} from "../../domain";
import type {
  PublishableReaderSummaryPublicationDecision,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryPublicationPort,
} from "../../ports";
import type { ExecuteReaderSummaryJobResult } from "./execute-reader-summary-job.result";

export const publishReaderSummaryJob = async (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly runningJob: ReaderSummaryJob;
  readonly publicationDecision: PublishableReaderSummaryPublicationDecision;
  readonly githubProjectionAudit: ReaderSummaryGitHubProjectionAudit;
  readonly jobs: ReaderSummaryJobRepositoryPort;
  readonly publications: ReaderSummaryPublicationPort;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}): Promise<Result<ExecuteReaderSummaryJobResult, DomainError>> => {
  const artifactSnapshot = params.artifact.toSnapshot();
  const completedAt = params.clock.now();
  const finalJob = artifactSnapshot.qualityFlags.includes("no_signal")
    ? params.runningJob.markNoSignal({
        completedAt,
        readerSummaryId: artifactSnapshot.readerSummaryId,
      })
    : params.runningJob.complete({
        completedAt,
        readerSummaryId: artifactSnapshot.readerSummaryId,
      });
  const finalSnapshot = finalJob.toSnapshot();
  const readyEvent = {
    eventId: eventId(params.ids.generate()),
    eventType: "reader_summary.ready",
    schemaVersion: 1,
    occurredAt: completedAt,
    tenantId: finalSnapshot.tenantId,
    workspaceId: finalSnapshot.workspaceId,
    correlationId: correlationId(finalSnapshot.id),
    causationId: causationId(finalSnapshot.id),
    payload: {
      readerSummaryJobId: finalSnapshot.id,
      readerSummaryId: artifactSnapshot.readerSummaryId,
      tenantId: finalSnapshot.tenantId,
      workspaceId: finalSnapshot.workspaceId,
      scope: finalSnapshot.scope,
      period: finalSnapshot.period,
      userId: finalSnapshot.userId,
      subscriptionId: finalSnapshot.subscriptionId,
      status:
        finalSnapshot.status === "no_signal" ? "no_signal" : "completed",
    },
  } satisfies ReaderSummaryReadyEvent;
  const publicationOutcome = await params.publications.publish({
    artifact: params.artifact,
    finalJob,
    publicationDecision: params.publicationDecision,
    githubProjectionAudit: params.githubProjectionAudit,
    readyEvent,
  });

  if (publicationOutcome === "stale") {
    const message =
      "Reader summary publication was rejected as a stale generation";
    await params.jobs.save(
      params.runningJob.fail({
        failedAt: params.clock.now(),
        failureReason: message,
      }),
    );
    return err(new DomainError("operation.conflict", message));
  }

  return ok({
    readerSummaryJobId: finalSnapshot.id,
    status: finalSnapshot.status,
    readerSummaryId: finalSnapshot.readerSummaryId,
  });
};
