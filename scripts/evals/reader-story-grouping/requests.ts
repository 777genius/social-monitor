import { resolveGatewayLlmTransportConfig, resolveSummaryAgentRuntimeTransport, assertReaderSummaryTransportBackend } from "@social-monitor/summary/adapters/composition/reader-summary-agent-runtime-transport";
import { gatewayLlmCanonicalRequest } from "@social-monitor/summary/adapters/model/gateway-llm/gateway-llm-request-identity";
import { approvedGatewayLlmSdkIdentity } from "@social-monitor/summary/adapters/model/gateway-llm/gateway-llm-sdk-identity";
import type { GatewayLlmRoute } from "@social-monitor/summary/adapters/model/gateway-llm/gateway-llm-client";
import type { ReaderSummaryGenerationBackend } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import { isAttestedRuntimeIdentity } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { assertStoryRelationResponseSchema } from
  "@social-monitor/summary/adapters/model/story-relation-response-schema";
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
import type { EvaluationRun } from "./run-identity";
import type { PreparedBlock } from "./replay";

export type EvaluationGatewayRoute = Omit<GatewayLlmRoute, "accountRefs">;
export const evaluationGatewayRoute = (env: NodeJS.ProcessEnv): EvaluationGatewayRoute | undefined => {
  const transport = resolveSummaryAgentRuntimeTransport(env);
  assertReaderSummaryTransportBackend(transport, env);
  if (transport !== "gateway-llm") return undefined;
  const { accountRefs, ...route } = resolveGatewayLlmTransportConfig(env).route; void accountRefs; return route;
};
const verifierRoute = (route?: EvaluationGatewayRoute) => route ? {
  model: route.model, modelBackend: route.modelBackend as ReaderSummaryGenerationBackend,
  reasoningEffort: route.reasoningEffort ?? "default",
} : {};
export type RequestEnvelope = {
  blockId: string; command: AgentRuntimeTaskCommand; commandSha256: string;
  canonicalRequest: Record<string, unknown>; canonicalRequestSha256: string;
  schemaSha256: string; candidateCount: number; evidenceSha256: string;
};
export type RequestManifest = {
  evaluationRun?: EvaluationRun;
  schemaVersion: 2 | 3; gateway?: EvaluationGatewayRoute; captureSourceRevision: string; evaluatedSource: EvaluatedSource;
  labelSealSha256: string; replaySha256: string;
  captureSha256: string; ownedFiles: Record<string, string>;
  effectBudget: { runTaskCalls: number; maxOutputTokens: number; timeoutMsPerCall: number };
  requests: RequestEnvelope[]; liveStatus: "NOT_RUN";
};
export const canonicalRequestFor = (command: AgentRuntimeTaskCommand, gateway?: EvaluationGatewayRoute): Record<string, unknown> =>
  gateway ? gatewayLlmCanonicalRequest(command, gateway) : admitSubscriptionRuntimeRequest({
    ...command, tenantId: String(command.tenantId), workspaceId: String(command.workspaceId),
    outputSchemaJson: JSON.stringify(command.outputSchema), controlsJson: JSON.stringify(command.controls),
    metadata: command.metadata ?? {},
  }).canonicalRequest;
class CaptureOnlyStop extends Error {}
export const captureRequest = async (p: PreparedBlock, gateway?: EvaluationGatewayRoute): Promise<RequestEnvelope | undefined> => {
  let command: AgentRuntimeTaskCommand | undefined;
  const client: AgentRuntimeClientPort = {
    runTask: async (value) => { command = value; throw new CaptureOnlyStop("capture-only; transport not called"); },
    checkHealth: async () => { throw new Error("Capture-only client has no health transport"); },
  };
  try { await new AgentRuntimeReaderSummaryStoryRelationVerifier({ client, ...verifierRoute(gateway) }).verify(p.verifierInput); }
  catch (error) { if (!(error instanceof CaptureOnlyStop)) throw error; }
  if (!command) { check(p.candidates.length === 0, "Missing captured request"); return undefined; }
  const canonicalRequest = canonicalRequestFor(command, gateway);
  return { blockId: p.block.id, command, commandSha256: canonicalJsonSha256(command), canonicalRequest,
    canonicalRequestSha256: canonicalJsonSha256(canonicalRequest),
    schemaSha256: canonicalJsonSha256(command.outputSchema), candidateCount: p.candidates.length,
    evidenceSha256: canonicalJsonSha256(JSON.parse(JSON.stringify(p.evidence)) as unknown),
  };
};
export const makeManifest = (data: Dataset, requests: RequestEnvelope[], evaluatedSource: EvaluatedSource, evaluationRun?: EvaluationRun, gateway?: EvaluationGatewayRoute): RequestManifest => ({
  ...(evaluationRun ? { evaluationRun } : {}),
  schemaVersion: gateway ? 3 : 2, ...(gateway ? { gateway } : {}), captureSourceRevision: CAPTURE_SOURCE_REVISION, evaluatedSource,
  labelSealSha256: data.labelSealSha256,
  replaySha256: data.replaySeal.replaySha256, captureSha256: data.seal.captureSha256,
  ownedFiles: Object.fromEntries(ownedSourceFiles().map((path) => [path, fileSha(path)])),
  effectBudget: { runTaskCalls: requests.length,
    maxOutputTokens: requests.reduce((sum, r) => sum + Number(r.canonicalRequest.maxOutputTokens ?? r.command.controls.maxOutputTokens), 0),
    timeoutMsPerCall: 300_000 }, requests, liveStatus: "NOT_RUN",
});
export const verifyManifest = (data: Dataset, expected: RequestManifest, actual: RequestManifest): void => {
  check([2, 3].includes(expected.schemaVersion) && expected.captureSourceRevision === CAPTURE_SOURCE_REVISION,
    "Manifest capture revision/schema mismatch; materialize fresh requests on the current commit");
  check(expected.labelSealSha256 === data.labelSealSha256, "Manifest label mismatch");
  check(canonicalJsonSha256(expected) === canonicalJsonSha256(actual), "Request/source/fixture manifest mismatch");
};
export type CaptureReceipt = {
  evaluationRun?: EvaluationRun;
  schemaVersion: 2 | 3; captureKind: "live_subscription" | "live_gateway" | "offline_fixture";
  manifestSha256: string; captureSourceRevision: string; evaluatedSource: EvaluatedSource;
  labelSealSha256: string; replaySha256: string;
  transport: {
    authentication: "existing_authenticated_composition" | "deterministic_fixture";
    operatorRecord: string; runtimePackageVersion: string; launcherSha256: string; runtimeEngine?: "gateway-llm";
  };
  responses: { blockId: string; commandSha256: string; canonicalRequestSha256: string;
    schemaSha256: string; evidenceSha256: string; receivedAt: string; result: AgentRuntimeTaskResult }[];
};
export const checkReceiptBinding = (manifest: RequestManifest, receipt: CaptureReceipt): void => {
  check(receipt.schemaVersion === manifest.schemaVersion && ["live_subscription", "live_gateway", "offline_fixture"].includes(receipt.captureKind), "Unknown receipt kind/schema");
  check(canonicalJsonSha256(receipt.evaluationRun ?? null) === canonicalJsonSha256(manifest.evaluationRun ?? null), "Receipt evaluation run mismatch");
  check(receipt.manifestSha256 === canonicalJsonSha256(manifest), "Receipt manifest mismatch");
  check(receipt.captureSourceRevision === CAPTURE_SOURCE_REVISION &&
    canonicalJsonSha256(receipt.evaluatedSource) === canonicalJsonSha256(manifest.evaluatedSource) &&
    receipt.labelSealSha256 === manifest.labelSealSha256 &&
    receipt.replaySha256 === manifest.replaySha256, "Receipt source/fixture mismatch");
  check(receipt.responses.length === manifest.requests.length, "Incomplete/extra response batch");
  check(new Set(receipt.responses.map((r) => r.blockId)).size === receipt.responses.length, "Duplicate response identity");
  check(receipt.transport.authentication === (receipt.captureKind !== "offline_fixture"
    ? "existing_authenticated_composition" : "deterministic_fixture"), "Receipt transport kind mismatch");
  check(receipt.transport.operatorRecord.trim().length > 0, "Missing transport provenance");
  check((manifest.schemaVersion === 3) === (manifest.gateway !== undefined), "Gateway manifest version mismatch");
  check(receipt.captureKind !== "live_gateway" || manifest.gateway !== undefined, "Gateway receipt requires gateway manifest");
  check(manifest.gateway === undefined || receipt.captureKind !== "live_subscription", "Gateway capture cannot claim CLI provenance");
  if (!manifest.gateway) check(receipt.transport.runtimeEngine === undefined, "Legacy transport identity changed");
  if (manifest.gateway) check(receipt.transport.runtimeEngine === "gateway-llm" &&
    receipt.transport.runtimePackageVersion === approvedGatewayLlmSdkIdentity.packageVersion &&
    receipt.transport.launcherSha256 === approvedGatewayLlmSdkIdentity.archiveSha256, "Gateway SDK identity mismatch");
  for (const envelope of manifest.requests) {
    const row = receipt.responses.find((r) => r.blockId === envelope.blockId);
    check(row, `Missing response ${envelope.blockId}`);
    if (!row) throw new Error("Unreachable missing response");
    for (const key of ["commandSha256", "canonicalRequestSha256", "schemaSha256", "evidenceSha256"] as const) {
      check(row[key] === envelope[key], `Receipt ${key} mismatch`);
    }
    check(canonicalJsonSha256(envelope.command) === envelope.commandSha256 &&
      canonicalJsonSha256(canonicalRequestFor(envelope.command, manifest.gateway)) === envelope.canonicalRequestSha256 &&
      canonicalJsonSha256(envelope.canonicalRequest) === envelope.canonicalRequestSha256, "Invalid frozen request identity");
    verifyCapturedRuntime(envelope, row.result, receipt.transport, manifest.gateway);
    check(Number.isFinite(Date.parse(row.receivedAt)), "Invalid receipt timestamp");
  }
};
export const verifyCapturedRuntime = (envelope: RequestEnvelope, result: AgentRuntimeTaskResult,
  transport: CaptureReceipt["transport"], gateway?: EvaluationGatewayRoute): void => {
  const a = result.executionAttestation;
    check(a?.schemaVersion === 1 && isAttestedRuntimeIdentity(a), "Invalid attested runtime identity");
    check(a?.requestId === envelope.command.requestId && a.purpose === envelope.command.purpose &&
      a.provider === envelope.command.provider && a.model === envelope.command.controls.model &&
      a.reasoningEffort === (envelope.command.controls.reasoningEffort ?? "default"), "Runtime command identity mismatch");
    if (gateway) check(a?.runtimeEngine === "gateway-llm" &&
      a.gateway.profileId === gateway.profileId && a.model === gateway.model &&
      (envelope.command.controls.modelBackend ?? "openai-chatgpt") === gateway.modelBackend &&
      a.reasoningEffort === (gateway.reasoningEffort ?? "default") &&
      a.runtimePackageVersion === approvedGatewayLlmSdkIdentity.packageVersion &&
      a.launcherSha256 === approvedGatewayLlmSdkIdentity.archiveSha256,
      "Gateway execution profile mismatch");
    else check(a?.runtimeEngine === "subscription-runtime-cli", "Legacy receipt requires CLI runtime identity");
    check(a?.canonicalRequestSha256 === envelope.canonicalRequestSha256, "Runtime canonical request mismatch");
    check(a?.launcherSha256 === transport.launcherSha256 &&
      a?.runtimePackageVersion === transport.runtimePackageVersion, "Runtime installation changed");
    check(a && executionAttestationOutputMatches(a, result), "Output hash mismatch");
  check(result.status === "completed" && result.failure === undefined, "Runtime did not complete");
};
export const normalizeCapturedResponse = async (p: PreparedBlock, envelope: RequestEnvelope,
  result: AgentRuntimeTaskResult): Promise<readonly unknown[]> => {
  // Both live (after saving the original row) and import use this strict boundary.
  assertStoryRelationResponseSchema(result.structuredOutput, envelope.command.outputSchema);
  const client: AgentRuntimeClientPort = {
    runTask: async (command) => {
      check(canonicalJsonSha256(command) === envelope.commandSha256, "Adapter command changed on response replay");
      return result;
    },
    checkHealth: async () => { throw new Error("Captured-response replay has no network"); },
  };
  return new AgentRuntimeReaderSummaryStoryRelationVerifier({ client,
    model: typeof envelope.command.controls.model === "string" ? envelope.command.controls.model : undefined,
    modelBackend: (envelope.command.controls.modelBackend ?? "openai-chatgpt") as ReaderSummaryGenerationBackend,
    reasoningEffort: typeof envelope.command.controls.reasoningEffort === "string"
      ? envelope.command.controls.reasoningEffort : "default",
  }).verify(p.verifierInput);
};
