import Ajv from "ajv";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { approvedGatewayLlmSdkIdentity as sdk } from "@social-monitor/summary/adapters/model/gateway-llm/gateway-llm-sdk-identity";
import type { AgentRuntimeTaskResult } from "@social-monitor/summary/ports";
import { loadDataset, readJson } from "./dataset";
import { prepareBlock, type PreparedBlock } from "./replay";
import { captureRequest, makeManifest, checkReceiptBinding, normalizeCapturedResponse,
  type RequestEnvelope, type CaptureReceipt } from "./requests";

const gateway = { profileId: "TEST-codex", modelBackend: "openai-chatgpt", model: "gpt-6.1-sol",
  reasoningEffort: "low" as const, minOutputTokens: 16_384 };
let prepared: PreparedBlock, envelope: RequestEnvelope;
const source = { revision: "b".repeat(40), treeSha: "c".repeat(40), worktree: "clean" as const };
beforeAll(async () => {
  const data = loadDataset();
  for (const block of data.blocks) {
    const p = await prepareBlock(data, block);
    const request = await captureRequest(p, gateway);
    if (request) { prepared = p; envelope = request; break; }
  }
});
function fixture() {
  const manifest = makeManifest(loadDataset(), [envelope], source, undefined, gateway);
  const structuredOutput = { decisions: prepared.candidates.map((pair) => ({
    leftFeedItemId: pair.leftFeedItemId, rightFeedItemId: pair.rightFeedItemId,
    sameStory: false, confidenceScore: 0.5, rationale: "Synthetic transport contract only.",
  })) };
  const result: AgentRuntimeTaskResult = { status: "completed", warnings: [], structuredOutput,
    executionAttestation: { schemaVersion: 1, requestId: envelope.command.requestId,
      purpose: envelope.command.purpose, provider: "codex", model: gateway.model, reasoningEffort: "low",
      canonicalRequestSha256: envelope.canonicalRequestSha256, runtimeEngine: "gateway-llm",
      runtimePackageVersion: sdk.packageVersion, launcherSha256: sdk.archiveSha256,
      selectedOutputKind: "structured_output", selectedOutputSha256: canonicalJsonSha256(structuredOutput),
      gateway: { profileId: gateway.profileId, taskId: "TEST-task", attempt: 1, executionRef: "TEST-execution",
        requestRef: "TEST-request", accountRef: "TEST-account", observedModel: "gpt-6.1-sol-2026-11-01",
        requestSha256: "d".repeat(64) },
    } };
  const receipt: CaptureReceipt = { schemaVersion: 3, captureKind: "offline_fixture",
    manifestSha256: canonicalJsonSha256(manifest), evaluatedSource: source,
    captureSourceRevision: manifest.captureSourceRevision, labelSealSha256: manifest.labelSealSha256,
    replaySha256: manifest.replaySha256,
    transport: { authentication: "deterministic_fixture", operatorRecord: "Synthetic transport only",
      runtimeEngine: "gateway-llm", runtimePackageVersion: sdk.packageVersion, launcherSha256: sdk.archiveSha256 },
    responses: [{ blockId: envelope.blockId, commandSha256: envelope.commandSha256,
      canonicalRequestSha256: envelope.canonicalRequestSha256, schemaSha256: envelope.schemaSha256,
      evidenceSha256: envelope.evidenceSha256, receivedAt: "2026-11-01T00:00:00Z", result }],
  };
  return { manifest, receipt, result };
}
it("captures and replays the gateway route with its SDK identity and effective budget", async () => {
  const { manifest, receipt, result } = fixture();
  expect(manifest.schemaVersion).toBe(3);
  expect(manifest.effectBudget.maxOutputTokens).toBe(16_384);
  expect(envelope.command.controls).toMatchObject({ model: "gpt-6.1-sol", reasoningEffort: "low" });
  expect(envelope.canonicalRequest).toMatchObject({ profileId: "TEST-codex", maxOutputTokens: 16_384 });
  expect(envelope.canonicalRequest).not.toHaveProperty("task");
  expect(() => checkReceiptBinding(manifest, receipt)).not.toThrow();
  const ajv = new Ajv();
  expect(ajv.validate(readJson<object>("scripts/evals/reader-story-grouping/request-manifest.schema.json"), manifest)).toBe(true);
  expect(ajv.validate(readJson<object>("scripts/evals/reader-story-grouping/receipt.schema.json"), receipt)).toBe(true);
  await expect(normalizeCapturedResponse(prepared, envelope, result)).resolves.toHaveLength(prepared.candidates.length);
  const legacy = await captureRequest(prepared);
  expect(legacy?.command.controls).toMatchObject({ model: "gpt-5.6-sol", reasoningEffort: "high" });
  expect(makeManifest(loadDataset(), [legacy!], source)).toMatchObject({ schemaVersion: 2 });
});
it.each(["canonical", "output", "sdk", "profile", "requestRef", "executionRef", "observedModel", "cliLabel"])(
  "rejects changed gateway %s proof", (kind) => {
    const { manifest, receipt, result } = fixture();
    const a = result.executionAttestation!;
    if (kind === "canonical") Object.assign(a, { canonicalRequestSha256: "e".repeat(64) });
    if (kind === "output") Object.assign(result, { structuredOutput: { changed: true } });
    if (kind === "sdk") Object.assign(a, { launcherSha256: "e".repeat(64) });
    if (kind === "cliLabel") Object.assign(receipt, { captureKind: "live_subscription" });
    if (a.runtimeEngine === "gateway-llm") {
      if (kind === "profile") Object.assign(a.gateway, { profileId: "TEST-other" });
      if (kind === "requestRef") Object.assign(a.gateway, { requestRef: "" });
      if (kind === "executionRef") Object.assign(a.gateway, { executionRef: "" });
      if (kind === "observedModel") Object.assign(a.gateway, { observedModel: "other-model" });
    }
    expect(() => checkReceiptBinding(manifest, receipt)).toThrow();
  });
