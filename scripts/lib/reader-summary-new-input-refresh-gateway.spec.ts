import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { approvedGatewayLlmSdkIdentity as sdk } from "@social-monitor/summary/adapters/model/gateway-llm/gateway-llm-sdk-identity";
import { gatewayLlmCanonicalRequestSha256 } from "@social-monitor/summary/adapters/model/gateway-llm/gateway-llm-request-identity";
import { activeReaderSummaryPurposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "@social-monitor/summary/ports";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { refreshModelCommand } from "./reader-summary-new-input-refresh-model.spec-support";
import { assertRefreshManifest, refreshOperation, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
import { guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { reconcileRefresh } from "./reader-summary-new-input-refresh-guard";
import { sourceContentAssessmentPurpose } from "./reader-summary-new-input-refresh-assessment-runtime";

const gateway = { profileId: "TEST-codex", modelBackend: "openai-chatgpt", model: "gpt-6.1-sol",
  reasoningEffort: "low" as const, minOutputTokens: 16_384 };
function manifest(): RefreshManifest {
  const value = { ...refreshManifest(), format: "reader-summary-seven-day-new-input-v2" as const, gateway,
    model: gateway.model, reasoningEffort: gateway.reasoningEffort,
    runtime: { engine: "gateway-llm", packageVersion: sdk.packageVersion, launcherSha256: sdk.archiveSha256 } };
  return { ...value, operation: refreshOperation(value) };
}
function command(purpose?: string): AgentRuntimeTaskCommand {
  const value = refreshModelCommand(purpose);
  return { ...value, prompt: purpose === sourceContentAssessmentPurpose
    ? JSON.stringify({ candidates: [{ candidateId: "TEST-candidate" }] }) : value.prompt,
    controls: { ...value.controls, model: gateway.model, reasoningEffort: gateway.reasoningEffort } };
}
function completed(value: AgentRuntimeTaskCommand): AgentRuntimeTaskResult {
  const structuredOutput = { synthetic: true };
  return { status: "completed", structuredOutput, warnings: [], usage: {
    inputTokens: 3, outputTokens: 2, totalTokens: 5, estimatedCostUsd: 0,
  }, executionAttestation: { schemaVersion: 1, requestId: value.requestId, purpose: value.purpose,
    provider: value.provider, model: gateway.model, reasoningEffort: gateway.reasoningEffort,
    canonicalRequestSha256: gatewayLlmCanonicalRequestSha256(value, gateway), runtimeEngine: "gateway-llm",
    runtimePackageVersion: sdk.packageVersion, launcherSha256: sdk.archiveSha256,
    selectedOutputKind: "structured_output", selectedOutputSha256: canonicalJsonSha256(structuredOutput),
    gateway: { profileId: gateway.profileId, taskId: "TEST-task", attempt: 1, executionRef: "TEST-execution",
      requestRef: "TEST-request", accountRef: "TEST-account", observedModel: "gpt-6.1-sol", requestSha256: "b".repeat(64) },
  } };
}
function runtime(result: AgentRuntimeTaskResult, authority = manifest()) {
  const runTask = jest.fn(async () => result), record = jest.fn();
  return { runTask, record, client: guardedRefreshRuntime({ manifest: authority,
    delegate: { runTask, checkHealth: jest.fn() }, now: () => refreshNow.getTime(),
    assertLocal: () => undefined, assertCurrent: async () => undefined, record }) };
}
it("versions gateway authority without changing dates, legacy hash inputs or consumed-date budget", () => {
  const original = refreshManifest(), value = manifest();
  // Original authority is independently sealed in p2-synthetic-capture.json.
  expect(original.operation).toBe("new-input-refresh:v1:2026-09-03:9325e36e4dbfa62ae2d7c0c4e8428a564308dd3f4d50da4bddd4d74445a9d1ef");
  expect(() => assertRefreshManifest(original, refreshNow)).not.toThrow();
  expect(() => assertRefreshManifest(value, refreshNow)).not.toThrow();
  expect(refreshOperation({ ...original, preparedAt: "changed", observedThrough: "changed" })).toBe(original.operation);
  expect(refreshOperation({ ...value, gateway: { ...gateway, profileId: "TEST-other" } })).not.toBe(value.operation);
  expect(() => assertRefreshManifest({ ...original, gateway }, refreshNow)).toThrow();
  expect(() => reconcileRefresh(value, [{ operation: original.operation, jobId: "TEST-consumed", artifactId: null,
    status: "FAILED", jobSha256: "a".repeat(64) }], value.prior)).toThrow(/consumed/);
});
it.each([activeReaderSummaryPurposes.generate, activeReaderSummaryPurposes.storyRelations, sourceContentAssessmentPurpose])(
  "verifies real gateway identity for %s without CLI admission", async (purpose) => {
    const value = command(purpose), test = runtime(completed(value));
    await expect(test.client.runTask(value)).resolves.toMatchObject({ status: "completed" });
    expect(test.runTask).toHaveBeenCalledTimes(1);
    await expect(test.client.runTask(value)).rejects.toThrow(/budget/);
  });
it.each(["request", "output", "sdk", "profile", "nativeRequest", "execution", "observedModel"])(
  "fails closed after a paid %s identity mismatch and never retries", async (kind) => {
    const value = command(), result = completed(value), a = result.executionAttestation!;
    if (kind === "request") Object.assign(a, { canonicalRequestSha256: "c".repeat(64) });
    if (kind === "output") Object.assign(result, { structuredOutput: { changed: true } });
    if (kind === "sdk") Object.assign(a, { launcherSha256: "c".repeat(64) });
    if (a.runtimeEngine === "gateway-llm") {
      if (kind === "profile") Object.assign(a.gateway, { profileId: "TEST-other" });
      if (kind === "nativeRequest") Object.assign(a.gateway, { requestSha256: "invalid" });
      if (kind === "execution") Object.assign(a.gateway, { executionRef: "" });
      if (kind === "observedModel") Object.assign(a.gateway, { observedModel: "different-model" });
    }
    const test = runtime(result);
    await expect(test.client.runTask(value)).rejects.toThrow(/remains consumed/);
    await expect(test.client.runTask({ ...value, requestId: "TEST-retry" })).rejects.toThrow(/budget/);
    expect(test.runTask).toHaveBeenCalledTimes(1);
    expect(test.record).toHaveBeenCalledWith(expect.objectContaining({ status: "requires_reconciliation" }));
  });

const supportedRoutes: NonNullable<RefreshManifest["gateway"]>[] = [
  { profileId: "TEST-kimi", modelBackend: "kimi-code", model: "k3-256k", minOutputTokens: 32_768 },
  { profileId: "TEST-router", modelBackend: "openrouter", model: "openai/gpt-oss-120b", minOutputTokens: 32_768 },
  { ...gateway, model: "gpt-5.6-sol", reasoningEffort: "high" as const },
];
it.each(supportedRoutes)("binds the supported gateway route $modelBackend/$model", async (route) => {
  const base = manifest(), effort = route.reasoningEffort ?? "default";
  const authority = { ...base, gateway: route, model: route.model, reasoningEffort: effort };
  authority.operation = refreshOperation(authority);
  expect(() => assertRefreshManifest(authority, refreshNow)).not.toThrow();
  const value = { ...command(), controls: { model: route.model, modelBackend: route.modelBackend,
    ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}) } };
  const result = completed(value), a = result.executionAttestation!;
  Object.assign(a, { model: route.model, reasoningEffort: effort,
    canonicalRequestSha256: gatewayLlmCanonicalRequestSha256(value, route) });
  if (a.runtimeEngine === "gateway-llm") Object.assign(a.gateway, { profileId: route.profileId, observedModel: route.model });
  await expect(runtime(result, authority).client.runTask(value)).resolves.toMatchObject({ status: "completed" });
});
