import { ExecuteReaderSummaryJobUseCase } from
  "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import type { ExecuteReaderSummaryJobCommand } from
  "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.command";
import { resolveLiveObservationCutoff } from "./reader-summary-capture-period-policy";

/** Keeps capture provenance and execution composed from the same parsed input. */
export const createReaderSummaryCaptureExecution = (
  policy: Parameters<typeof resolveLiveObservationCutoff>[0],
) => {
  const cutoffTime = resolveLiveObservationCutoff(policy)?.getTime();
  return {
    liveObservationCutoff: cutoffTime === undefined ? undefined : new Date(cutoffTime),
    execute(
      dependencies: ConstructorParameters<typeof ExecuteReaderSummaryJobUseCase>,
      command: Omit<ExecuteReaderSummaryJobCommand, "observedThrough">,
    ) {
      return new ExecuteReaderSummaryJobUseCase(...dependencies).execute({
        ...command,
        ...(cutoffTime === undefined ? {} : { observedThrough: new Date(cutoffTime) }),
      });
    },
  };
};
