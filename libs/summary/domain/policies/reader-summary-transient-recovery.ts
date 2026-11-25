import type { ReaderSummaryJobProps } from "../entities/reader-summary-job";

const recoverySuffix = /:transient-retry:([0-9]+)$/u;
const transientFailure = /^presentation_runtime_failure_repeated:(task_timeout|provider_failed|provider_output_lost):executions_closed$/u;
export const readerSummaryMaxTransientRecoveries = 2;

/** Automatic scheduled recovery is a new, bounded generation after a known
 * terminal dependency failure. Unknown effects, auth, quality and native
 * operator-owned jobs never acquire automatic replacement authority.
 */
export const readerSummaryTransientRecoveryKey = (
  job: ReaderSummaryJobProps, now: Date,
): string | undefined => {
  const attempt = Number(recoverySuffix.exec(job.idempotencyKey)?.[1] ?? 0);
  if (attempt >= readerSummaryMaxTransientRecoveries || job.status !== "failed" ||
      job.selectionStrategy !== "jev_primary_v3" ||
      job.terminalFailureCode !== "presentation_dependency_unavailable" ||
      !transientFailure.test(job.failureReason ?? "") || job.failedAt === undefined ||
      now.getTime() < job.failedAt.getTime() + (attempt + 1) * 5 * 60_000 ||
      now.getTime() > job.period.endedAt.getTime() + 48 * 60 * 60_000 ||
      job.idempotencyKey.startsWith("native-reader-summary-v3:")) return undefined;
  return `${job.idempotencyKey.replace(recoverySuffix, "")}:transient-retry:${attempt + 1}`;
};
