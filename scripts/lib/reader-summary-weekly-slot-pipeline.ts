import type {
  ReaderSummaryWeeklyProductionWindow,
} from "./reader-summary-weekly-production-postgres-contract";
import type {
  ReaderSummaryWeeklyScheduledSlotOutcome,
} from "./reader-summary-weekly-production-scheduler";

export type ReaderSummaryWeeklySlotPipelineMode = "normal" | "replay";

export type ReaderSummaryWeeklySlotPipelineAdmission<TManifest> =
  | Readonly<{
      status: "admitted";
      reviewManifest: TManifest;
    }>
  | Readonly<{
      status: "terminal";
      outcome: ReaderSummaryWeeklyScheduledSlotOutcome;
    }>;

export type ReaderSummaryWeeklySlotPipelineAdmissionRequest<TDbState> =
  Readonly<{
    mode: ReaderSummaryWeeklySlotPipelineMode;
    window: ReaderSummaryWeeklyProductionWindow;
    dbState: TDbState;
  }>;

export type ReaderSummaryWeeklySlotPipelineExecutionRequest<
  TDbState,
  TManifest,
> = Readonly<{
  window: ReaderSummaryWeeklyProductionWindow;
  dbState: TDbState;
  reviewManifest: TManifest;
}>;

export type ReaderSummaryWeeklySlotPipelineReplayRequest<
  TDbState,
  TManifest,
> = ReaderSummaryWeeklySlotPipelineExecutionRequest<TDbState, TManifest> &
  Readonly<{
    mode: "replay";
    zeroModel: true;
    zeroWrite: true;
  }>;

type ReaderSummaryWeeklySlotPipelineBase<TDbState, TManifest> = Readonly<{
  window: ReaderSummaryWeeklyProductionWindow;
  loadDbState: (
    window: ReaderSummaryWeeklyProductionWindow,
  ) => Promise<TDbState>;
  admitReviewManifest: (
    request: ReaderSummaryWeeklySlotPipelineAdmissionRequest<TDbState>,
  ) => Promise<ReaderSummaryWeeklySlotPipelineAdmission<TManifest>>;
  replayZeroModel: (
    request: ReaderSummaryWeeklySlotPipelineReplayRequest<TDbState, TManifest>,
  ) => Promise<ReaderSummaryWeeklyScheduledSlotOutcome>;
}>;

export type ReaderSummaryWeeklyNormalSlotPipelineParams<TDbState, TManifest> =
  ReaderSummaryWeeklySlotPipelineBase<TDbState, TManifest> & Readonly<{
    mode: "normal";
    backfillDailyCertifications: (
      window: ReaderSummaryWeeklyProductionWindow,
    ) => Promise<void>;
    synthesizeAndPublish: (
      request: ReaderSummaryWeeklySlotPipelineExecutionRequest<TDbState, TManifest>,
    ) => Promise<ReaderSummaryWeeklyScheduledSlotOutcome>;
    persistReplayFailure?: (
      request: ReaderSummaryWeeklySlotPipelineExecutionRequest<TDbState, TManifest>,
      outcome: ReaderSummaryWeeklyScheduledSlotOutcome,
    ) => Promise<void>;
    complete: (
      request: ReaderSummaryWeeklySlotPipelineExecutionRequest<TDbState, TManifest>,
    ) => Promise<ReaderSummaryWeeklyScheduledSlotOutcome>;
  }>;

export type ReaderSummaryWeeklyReplaySlotPipelineParams<TDbState, TManifest> =
  ReaderSummaryWeeklySlotPipelineBase<TDbState, TManifest> & Readonly<{
    mode: "replay";
  }>;

export type ReaderSummaryWeeklySlotPipelineParams<TDbState, TManifest> =
  | ReaderSummaryWeeklyNormalSlotPipelineParams<TDbState, TManifest>
  | ReaderSummaryWeeklyReplaySlotPipelineParams<TDbState, TManifest>;

export const runReaderSummaryWeeklySlotPipeline = async <TDbState, TManifest>(
  params: ReaderSummaryWeeklySlotPipelineParams<TDbState, TManifest>,
): Promise<ReaderSummaryWeeklyScheduledSlotOutcome> => {
  if (params.mode === "normal") {
    await params.backfillDailyCertifications(params.window);
  }

  const dbState = await params.loadDbState(params.window);
  const admission = await params.admitReviewManifest({
    mode: params.mode,
    window: params.window,
    dbState,
  });
  if (admission.status === "terminal") return admission.outcome;

  const execution = Object.freeze({
    window: params.window,
    dbState,
    reviewManifest: admission.reviewManifest,
  });
  if (params.mode === "replay") {
    return params.replayZeroModel(Object.freeze({
      ...execution,
      mode: "replay" as const,
      zeroModel: true as const,
      zeroWrite: true as const,
    }));
  }

  const synthesis = await params.synthesizeAndPublish(execution);
  if (synthesis.status !== "completed") return synthesis;

  const replay = await params.replayZeroModel(Object.freeze({
    ...execution,
    mode: "replay" as const,
    zeroModel: true as const,
    zeroWrite: true as const,
  }));
  if (replay.status !== "completed") {
    await params.persistReplayFailure?.(execution, replay);
    return replay;
  }

  return params.complete(execution);
};
