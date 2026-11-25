import { readerSummaryScopeKey } from "../../domain";
import type { ReaderSummaryPublicationCommand } from "../../ports";

export type ReaderSummaryPublicationRequestV2 = Readonly<{
  schemaVersion: "reader_summary.publication_command.v2";
  tenantId: string;
  workspaceId: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
}>;

export const buildReaderSummaryPublicationRequestV2 = (
  command: ReaderSummaryPublicationCommand,
): ReaderSummaryPublicationRequestV2 => {
  const job = command.finalJob.toSnapshot();
  if (!readerSummaryPublicationHasWeeklyDailyEvidence(command)) {
    throw new Error(
      "Reader summary publication command v2 requires one exact UTC day",
    );
  }
  if (
    job.readerSummaryId === undefined ||
    readerSummaryScopeKey(job.scope).length === 0
  ) {
    throw new Error(
      "Reader summary publication command v2 requires exact DB locators",
    );
  }
  return Object.freeze({
    schemaVersion: "reader_summary.publication_command.v2",
    tenantId: job.tenantId,
    workspaceId: job.workspaceId,
    readerSummaryJobId: job.id,
    readerSummaryArtifactId: job.readerSummaryId,
  });
};

export const readerSummaryPublicationHasWeeklyDailyEvidence = (
  command: ReaderSummaryPublicationCommand,
): boolean => {
  const job = command.finalJob.toSnapshot();
  if (
    job.period.cadence !== "daily" ||
    job.period.timezone !== "UTC" ||
    job.period.startedAt.toISOString() !==
      `${job.period.startedAt.toISOString().slice(0, 10)}T00:00:00.000Z`
  ) {
    return false;
  }
  const startedAt = job.period.startedAt.getTime();
  return (
    Number.isFinite(startedAt) &&
    new Date(startedAt + 86_400_000).getTime() ===
      job.period.endedAt.getTime()
  );
};
