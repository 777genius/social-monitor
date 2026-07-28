import { randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

import { readerSummaryWeeklyScopeKey } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import type { ReaderSummaryWeeklyModelInput } from "../../libs/summary/ports/reader-summary-weekly-model.port";
import type { ReaderSummaryWeeklyProductionDbState } from "./reader-summary-weekly-production-postgres-contract";

type WeeklyProductionReplayCanary = Readonly<{
  schemaVersion: "reader_summary.weekly_production_replay_canary.v1";
  generatedBy: string;
  status: "passed";
  tenantId: string;
  workspaceId: string;
  scopeKey: string;
  weekStartedOn: string;
  weekEndedOn: string;
  replayedAt: string;
  artifactSha256: string;
  proofSha256: string;
  modelInputSealSha: string;
  zeroModelCalls: true;
  zeroProviderCalls: true;
  zeroArtifactWrites: true;
}>;

export const writeReaderSummaryWeeklyProductionReplayCanary = (params: {
  outputDirectory: string;
  replayCanaryPath: string;
  generatedBy: string;
  generatedAt: Date;
  dbState: ReaderSummaryWeeklyProductionDbState;
  input: ReaderSummaryWeeklyModelInput;
  artifactSha256: string;
  proofSha256: string;
}): boolean => {
  if (existsSync(params.replayCanaryPath)) {
    assertReplayCanary(
      JSON.parse(readFileSync(params.replayCanaryPath, "utf8")) as unknown,
      params,
    );
    return false;
  }
  const replayCanary: WeeklyProductionReplayCanary = Object.freeze({
    schemaVersion: "reader_summary.weekly_production_replay_canary.v1",
    generatedBy: params.generatedBy,
    status: "passed",
    tenantId: params.dbState.scope.tenantId,
    workspaceId: params.dbState.scope.workspaceId,
    scopeKey: readerSummaryWeeklyScopeKey(params.dbState.scope.scope),
    weekStartedOn: params.dbState.window.weekStartedOn,
    weekEndedOn: params.dbState.window.weekEndedOn,
    replayedAt: params.generatedAt.toISOString(),
    artifactSha256: params.artifactSha256,
    proofSha256: params.proofSha256,
    modelInputSealSha: params.input.sealSha,
    zeroModelCalls: true,
    zeroProviderCalls: true,
    zeroArtifactWrites: true,
  });
  const replayCanaryTemp = join(
    params.outputDirectory,
    `.${basename(params.replayCanaryPath)}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(replayCanaryTemp, `${JSON.stringify(replayCanary, null, 2)}\n`, {
      flag: "wx",
      mode: 0o444,
    });
    linkSync(replayCanaryTemp, params.replayCanaryPath);
  } finally {
    rmSync(replayCanaryTemp, { force: true });
  }
  assertReplayCanary(replayCanary, params);
  return true;
};

const assertReplayCanary = (
  value: unknown,
  params: {
    generatedBy: string;
    dbState: ReaderSummaryWeeklyProductionDbState;
    input: ReaderSummaryWeeklyModelInput;
    artifactSha256: string;
    proofSha256: string;
  },
): void => {
  const canary = value as WeeklyProductionReplayCanary;
  if (
    canary.schemaVersion !==
      "reader_summary.weekly_production_replay_canary.v1" ||
    canary.generatedBy !== params.generatedBy ||
    canary.status !== "passed" ||
    canary.tenantId !== params.dbState.scope.tenantId ||
    canary.workspaceId !== params.dbState.scope.workspaceId ||
    canary.scopeKey !== readerSummaryWeeklyScopeKey(params.dbState.scope.scope) ||
    canary.weekStartedOn !== params.dbState.window.weekStartedOn ||
    canary.weekEndedOn !== params.dbState.window.weekEndedOn ||
    !Number.isFinite(Date.parse(canary.replayedAt)) ||
    canary.artifactSha256 !== params.artifactSha256 ||
    canary.proofSha256 !== params.proofSha256 ||
    canary.modelInputSealSha !== params.input.sealSha ||
    canary.zeroModelCalls !== true ||
    canary.zeroProviderCalls !== true ||
    canary.zeroArtifactWrites !== true
  ) {
    throw new Error("Reader summary weekly replay canary is invalid");
  }
};
