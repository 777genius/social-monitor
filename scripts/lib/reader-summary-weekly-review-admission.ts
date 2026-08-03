import type {
  ReaderSummaryWeeklyReviewManifest,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";
import type {
  AgentRuntimeClientPort,
} from "../../libs/summary/ports/agent-runtime-client.port";
import {
  ReaderSummaryWeeklyReviewManifestCorruptionError,
  type ReaderSummaryWeeklyReviewManifestPort,
} from "../../libs/summary/ports/reader-summary-weekly-review-manifest.port";

import {
  readerSummaryWeeklyReviewAuthorityFromProductionState,
  type ReaderSummaryWeeklyProductionDbState,
} from "./reader-summary-weekly-production-postgres-contract";
import { buildModelInputFromDbState } from "./reader-summary-weekly-production-input";
import {
  ReaderSummaryWeeklyReviewManifestAuthorityError,
  runReaderSummaryWeeklyReviewProducer,
} from "./reader-summary-weekly-review-producer";
import { ReaderSummaryWeeklySubscriptionRuntimeFailureError } from "./reader-summary-weekly-execution-receipt";

export type ReaderSummaryWeeklyReviewAdmission =
  | Readonly<{
      status: "complete";
      manifest: ReaderSummaryWeeklyReviewManifest;
      modelCallPerformed: boolean;
      writePerformed: boolean;
    }>
  | Readonly<{
      status: "partial";
      reasons: readonly string[];
      modelCallPerformed: false;
      writePerformed: false;
    }>;

export type AdmitReaderSummaryWeeklyReviewParams = Readonly<{
  dbState: ReaderSummaryWeeklyProductionDbState;
  replay: boolean;
  manifestStore: ReaderSummaryWeeklyReviewManifestPort;
  agentRuntime?: AgentRuntimeClientPort;
}>;

export const admitReaderSummaryWeeklyReviewManifest = async (
  params: AdmitReaderSummaryWeeklyReviewParams,
): Promise<ReaderSummaryWeeklyReviewAdmission> => {
  if (params.dbState.status !== "complete") {
    return partial(params.dbState.blockingReasons);
  }
  const authority = readerSummaryWeeklyReviewAuthorityFromProductionState(
    params.dbState,
  );
  try {
    if (params.replay) {
      const manifest = await params.manifestStore.findBySeal({
        tenantId: authority.tenantId,
        workspaceId: authority.workspaceId,
        scope: authority.scope,
        weekStartedOn: authority.weekStartedOn,
        sealId: authority.sealId,
      });
      return manifest === null
        ? partial(["replay requested but weekly review manifest is missing"])
        : complete({
            dbState: params.dbState,
            manifest,
            modelCallPerformed: false,
            writePerformed: false,
          });
    }
    if (params.agentRuntime === undefined) {
      return partial(["weekly review producer runtime is unavailable"]);
    }
    const produced = await runReaderSummaryWeeklyReviewProducer({
      authorityLoader: { load: async () => authority },
      manifestStore: params.manifestStore,
      agentRuntime: params.agentRuntime,
    });
    return complete({
      dbState: params.dbState,
      manifest: produced.manifest,
      modelCallPerformed: produced.modelCallPerformed,
      writePerformed: produced.writePerformed,
    });
  } catch (error: unknown) {
    if (error instanceof ReaderSummaryWeeklySubscriptionRuntimeFailureError) {
      throw error;
    }
    if (
      error instanceof ReaderSummaryWeeklyReviewManifestAuthorityError ||
      error instanceof ReaderSummaryWeeklyReviewManifestCorruptionError
    ) {
      return partial([
        "weekly review manifest is corrupt or does not match sealed DB authority",
      ]);
    }
    throw error;
  }
};

const complete = (params: Readonly<{
  dbState: ReaderSummaryWeeklyProductionDbState;
  manifest: ReaderSummaryWeeklyReviewManifest;
  modelCallPerformed: boolean;
  writePerformed: boolean;
}>): ReaderSummaryWeeklyReviewAdmission => {
  const input = buildModelInputFromDbState(params.dbState, params.manifest);
  if (input.status === "partial") return partial(input.reasons);
  return Object.freeze({
    status: "complete" as const,
    manifest: params.manifest,
    modelCallPerformed: params.modelCallPerformed,
    writePerformed: params.writePerformed,
  });
};

const partial = (
  reasons: readonly string[],
): Extract<ReaderSummaryWeeklyReviewAdmission, { status: "partial" }> =>
  Object.freeze({
    status: "partial" as const,
    reasons: Object.freeze([...reasons]),
    modelCallPerformed: false,
    writePerformed: false,
  });
