import { AgentRuntimeReaderSummaryStoryRelationVerifier } from
  "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter";
import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from
  "@social-monitor/summary/ports";
import { canonicalJsonSha256, executionAttestationOutputMatches } from
  "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { admitSubscriptionRuntimeRequest } from
  "../../../apps/agent-runtime/src/subscription-runtime-purpose-model-policy";
import { check, fileSha, ownedSourceFiles, CAPTURE_SOURCE_REVISION, type Dataset } from "./dataset";
import type { EvaluatedSource } from "./source-identity";
import type { PreparedBlock } from "./replay";

export type RequestEnvelope = {
  blockId: string; command: AgentRuntimeTaskCommand; commandSha256: string;
  canonicalRequest: Record<string, unknown>; canonicalRequestSha256: string;
  schemaSha256: string; candidateCount: number; evidenceSha256: string;
};
export type RequestManifest = {
  schemaVersion: 2; captureSourceRevision: string; evaluatedSource: EvaluatedSource;
  labelSealSha256: string; replaySha256: string;
  captureSha256: string; ownedFiles: Record<string, string>;
  effectBudget: { runTaskCalls: number; maxOutputTokens: number; timeoutMsPerCall: number };
  requests: RequestEnvelope[]; liveStatus: "NOT_RUN";
};
export const canonicalRequestFor = (command: AgentRuntimeTaskCommand): Record<string, unknown> =>
  admitSubscriptionRuntimeRequest({
    ...command, tenantId: String(command.tenantId), workspaceId: String(command.workspaceId),
    outputSchemaJson: JSON.stringify(command.outputSchema), controlsJson: JSON.stringify(command.controls),
    metadata: command.metadata ?? {},
  }).canonicalRequest;
class CaptureOnlyStop extends Error {}
export const captureRequest = async (p: PreparedBlock): Promise<RequestEnvelope | undefined> => {
  let command: AgentRuntimeTaskCommand | undefined;
  const client: AgentRuntimeClientPort = {
    runTask: async (value) => { command = value; throw new CaptureOnlyStop("capture-only; transport not called"); },
    checkHealth: async () => { throw new Error("Capture-only client has no health transport"); },
  };
  try { await new AgentRuntimeReaderSummaryStoryRelationVerifier({ client }).verify(p.verifierInput); }
  catch (error) { if (!(error instanceof CaptureOnlyStop)) throw error; }
  if (!command) { check(p.candidates.length === 0, "Missing captured request"); return undefined; }
  const canonicalRequest = canonicalRequestFor(command);
  return { blockId: p.block.id, command, commandSha256: canonicalJsonSha256(command), canonicalRequest,
    canonicalRequestSha256: canonicalJsonSha256(canonicalRequest),
    schemaSha256: canonicalJsonSha256(command.outputSchema), candidateCount: p.candidates.length,
    evidenceSha256: canonicalJsonSha256(JSON.parse(JSON.stringify(p.evidence)) as unknown),
  };
};
export const makeManifest = (data: Dataset, requests: RequestEnvelope[], evaluatedSource: EvaluatedSource): RequestManifest => ({
  schemaVersion: 2, captureSourceRevision: CAPTURE_SOURCE_REVISION, evaluatedSource,
  labelSealSha256: data.labelSealSha256,
  replaySha256: data.replaySeal.replaySha256, captureSha256: data.seal.captureSha256,
  ownedFiles: Object.fromEntries(ownedSourceFiles().map((path) => [path, fileSha(path)])),
  effectBudget: { runTaskCalls: requests.length,
    maxOutputTokens: requests.reduce((sum, r) => sum + Number(r.command.controls.maxOutputTokens), 0),
    timeoutMsPerCall: 300_000 }, requests, liveStatus: "NOT_RUN",
});
export const verifyManifest = (data: Dataset, expected: RequestManifest, actual: RequestManifest): void => {
  check(expected.schemaVersion === 2 && expected.captureSourceRevision === CAPTURE_SOURCE_REVISION,
    "Manifest capture revision/schema mismatch; materialize fresh requests on the current commit");
  check(expected.labelSealSha256 === data.labelSealSha256, "Manifest label mismatch");
  check(canonicalJsonSha256(expected) === canonicalJsonSha256(actual), "Request/source/fixture manifest mismatch");
};
export type CaptureReceipt = {
  schemaVersion: 2; captureKind: "live_subscription" | "offline_fixture";
  manifestSha256: string; captureSourceRevision: string; evaluatedSource: EvaluatedSource;
  labelSealSha256: string; replaySha256: string;
  transport: {
    authentication: "existing_authenticated_composition" | "deterministic_fixture";
    operatorRecord: string; runtimePackageVersion: string; launcherSha256: string;
  };
  responses: { blockId: string; commandSha256: string; canonicalRequestSha256: string;
    schemaSha256: string; evidenceSha256: string; receivedAt: string; result: AgentRuntimeTaskResult }[];
};
export const checkReceiptBinding = (manifest: RequestManifest, receipt: CaptureReceipt): void => {
  check(receipt.schemaVersion === 2 && ["live_subscription", "offline_fixture"].includes(receipt.captureKind), "Unknown receipt kind/schema");
  check(receipt.manifestSha256 === canonicalJsonSha256(manifest), "Receipt manifest mismatch");
  check(receipt.captureSourceRevision === CAPTURE_SOURCE_REVISION &&
    canonicalJsonSha256(receipt.evaluatedSource) === canonicalJsonSha256(manifest.evaluatedSource) &&
    receipt.labelSealSha256 === manifest.labelSealSha256 &&
    receipt.replaySha256 === manifest.replaySha256, "Receipt source/fixture mismatch");
  check(receipt.responses.length === manifest.requests.length, "Incomplete/extra response batch");
  check(new Set(receipt.responses.map((r) => r.blockId)).size === receipt.responses.length, "Duplicate response identity");
  check(receipt.transport.authentication === (receipt.captureKind === "live_subscription"
    ? "existing_authenticated_composition" : "deterministic_fixture"), "Receipt transport kind mismatch");
  check(receipt.transport.operatorRecord.trim().length > 0, "Missing transport provenance");
  for (const envelope of manifest.requests) {
    const row = receipt.responses.find((r) => r.blockId === envelope.blockId);
    check(row, `Missing response ${envelope.blockId}`);
    if (!row) throw new Error("Unreachable missing response");
    for (const key of ["commandSha256", "canonicalRequestSha256", "schemaSha256", "evidenceSha256"] as const) {
      check(row[key] === envelope[key], `Receipt ${key} mismatch`);
    }
    const a = row.result.executionAttestation;
    check(a?.canonicalRequestSha256 === envelope.canonicalRequestSha256, "Runtime canonical request mismatch");
    check(a?.launcherSha256 === receipt.transport.launcherSha256 &&
      a?.runtimePackageVersion === receipt.transport.runtimePackageVersion, "Runtime installation changed");
    check(a && executionAttestationOutputMatches(a, row.result), "Output hash mismatch");
    check(Number.isFinite(Date.parse(row.receivedAt)), "Invalid receipt timestamp");
  }
};
export const normalizeCapturedResponse = async (p: PreparedBlock, envelope: RequestEnvelope,
  result: AgentRuntimeTaskResult): Promise<readonly unknown[]> => {
  const client: AgentRuntimeClientPort = {
    runTask: async (command) => {
      check(canonicalJsonSha256(command) === envelope.commandSha256, "Adapter command changed on response replay");
      return result;
    },
    checkHealth: async () => { throw new Error("Captured-response replay has no network"); },
  };
  return new AgentRuntimeReaderSummaryStoryRelationVerifier({ client }).verify(p.verifierInput);
};
