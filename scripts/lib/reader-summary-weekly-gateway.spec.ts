import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  canonicalJsonSha256,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { gatewayLlmCanonicalRequestSha256 } from "../../libs/summary/adapters/model/gateway-llm/gateway-llm-request-identity";
import { approvedGatewayLlmSdkIdentity, historicalGatewayLlmSdkIdentity } from "../../libs/summary/adapters/model/gateway-llm/gateway-llm-sdk-identity";
import { canonicalizeReaderSummaryWeeklyJson } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeExecutionAttestation,
  AgentRuntimeTaskCommand,
} from "../../libs/summary/ports/agent-runtime-client.port";
import {
  AgentRuntimeReaderSummaryWeeklyTextModel,
  buildModelInputFromDbState,
  runReaderSummaryWeeklyProduction,
} from "./reader-summary-weekly-production-runner";
import {
  assertReaderSummaryWeeklyProductionModelProof,
} from "./reader-summary-weekly-production-execution-proof";
import { resolveReaderSummaryWeeklyExecutionProfile } from "./reader-summary-weekly-execution-profile";
import { admittedRunnerInput, sha } from "./reader-summary-weekly-production-test-fixture";
import { completeModelInput, outputFor } from "./reader-summary-weekly-production-test-output";

const profile = Object.freeze({ transport: "gateway-llm" as const,
  model: "gpt-6.1-terra", reasoningEffort: "medium", gatewayMinOutputTokens: 16_384 });
const route = { profileId: "openai-codex-oauth-responses-v1", model: "gpt-6.1-terra",
  reasoningEffort: "medium" as const, minOutputTokens: 16_384 };
const attestation = (command: AgentRuntimeTaskCommand, output: Record<string, unknown>): AgentRuntimeExecutionAttestation => ({
  schemaVersion: 1, requestId: command.requestId, purpose: command.purpose,
  canonicalRequestSha256: gatewayLlmCanonicalRequestSha256(command, route),
  provider: "codex", model: "gpt-6.1-terra", reasoningEffort: "medium", runtimeEngine: "gateway-llm",
  runtimePackageVersion: approvedGatewayLlmSdkIdentity.packageVersion,
  launcherSha256: approvedGatewayLlmSdkIdentity.archiveSha256,
  selectedOutputKind: "structured_output", selectedOutputSha256: canonicalJsonSha256(output),
  gateway: { profileId: route.profileId, taskId: "test_weekly_task", attempt: 1,
    executionRef: "test_weekly_execution", requestRef: "test_weekly_request",
    accountRef: "test_weekly_account", observedModel: "gpt-6.1-terra-2026-10-01", requestSha256: sha("wire") },
});
const runtime = (change?: (proof: AgentRuntimeExecutionAttestation) => AgentRuntimeExecutionAttestation): jest.Mocked<AgentRuntimeClientPort> => ({
  runTask: jest.fn(async (command) => {
    const structuredOutput = { ...outputFor(completeModelInput()) };
    const proof = attestation(command, structuredOutput);
    return { status: "completed" as const, warnings: [], structuredOutput,
      executionAttestation: change?.(proof) ?? proof };
  }),
  checkHealth: jest.fn(),
});

describe("weekly gateway execution evidence", () => {
  it.each([approvedGatewayLlmSdkIdentity, historicalGatewayLlmSdkIdentity])(
    "replays saved $packageVersion selected-output proof without model calls or byte changes", async (sdk) => {
    const client = runtime();
    const model = new AgentRuntimeReaderSummaryWeeklyTextModel({ client, executionProfile: profile });
    const args = admittedRunnerInput();
    const captureDirectory = mkdtempSync(join(tmpdir(), "weekly-gateway-proof-"));
    const first = await runReaderSummaryWeeklyProduction({ ...args, outputDirectory: captureDirectory, model,
      replay: false,
      generatedAt: new Date("2026-07-27T06:30:00.000Z") });
    expect(first.status).toBe("complete");
    const proof = JSON.parse(readFileSync(first.proofPath!, "utf8"));
    expect(proof.model).toMatchObject({ provider: "gateway-llm", model: "gpt-6.1-terra",
      reasoningEffort: "medium", runtimeOutput: "structured_output",
      executionAttestation: { runtimeEngine: "gateway-llm", gateway: { executionRef: "test_weekly_execution" } } });
    // Seed a separate retained fixture before invoking its reader. The real
    // published files stay read-only and are never rewritten by this test.
    const outputDirectory = mkdtempSync(join(tmpdir(), "weekly-retained-sdk-proof-"));
    const proofPath = join(outputDirectory, basename(first.proofPath!));
    const artifactPath = join(outputDirectory, basename(first.artifactPath!));
    Object.assign(proof.model.executionAttestation, {
      runtimePackageVersion: sdk.packageVersion, launcherSha256: sdk.archiveSha256,
    });
    writeFileSync(proofPath, canonicalizeReaderSummaryWeeklyJson(proof, "retained weekly fixture").toBytes());
    writeFileSync(artifactPath, readFileSync(first.artifactPath!));
    const proofBytes = readFileSync(proofPath);
    const artifactBytes = readFileSync(artifactPath);
    const replayModel = { generate: jest.fn(async () => { throw new Error("paid replay"); }) };
    const replay = await runReaderSummaryWeeklyProduction({ ...args, outputDirectory, model: replayModel,
      replay: true, generatedAt: new Date("2026-07-27T06:31:00.000Z") });
    expect(replay).toMatchObject({ status: "complete", replayed: true, modelCallPerformed: false });
    expect(replayModel.generate).not.toHaveBeenCalled();
    expect(client.runTask).toHaveBeenCalledTimes(1);
    expect(readFileSync(proofPath)).toEqual(proofBytes);
    expect(readFileSync(artifactPath)).toEqual(artifactBytes);
    const admitted = buildModelInputFromDbState(args.dbState, args.reviewManifest);
    if (admitted.status !== "complete") throw new Error("fixture admission failed");
    const changed = { ...proof.model, rawStructuredOutput: { ...proof.model.rawStructuredOutput, headline: "Tampered" } };
    expect(() => assertReaderSummaryWeeklyProductionModelProof(changed, admitted.input, outputFor(admitted.input)))
      .toThrow("selected output proof diverged");
  });

  it.each([
    ["SDK digest", (proof: AgentRuntimeExecutionAttestation) => ({ ...proof, launcherSha256: sha("unapproved") })],
    ["historical SDK", (proof: AgentRuntimeExecutionAttestation) => ({ ...proof,
      runtimePackageVersion: historicalGatewayLlmSdkIdentity.packageVersion,
      launcherSha256: historicalGatewayLlmSdkIdentity.archiveSha256 })],
    ["historical version with current digest", (proof: AgentRuntimeExecutionAttestation) => ({ ...proof,
      runtimePackageVersion: historicalGatewayLlmSdkIdentity.packageVersion })],
    ["current version with historical digest", (proof: AgentRuntimeExecutionAttestation) => ({ ...proof,
      launcherSha256: historicalGatewayLlmSdkIdentity.archiveSha256 })],
    ["canonical request", (proof: AgentRuntimeExecutionAttestation) => ({ ...proof, canonicalRequestSha256: sha("different-prompt") })],
    ["request id", (proof: AgentRuntimeExecutionAttestation) => ({ ...proof, requestId: "another-week" })],
    ["selected output", (proof: AgentRuntimeExecutionAttestation) => ({ ...proof, selectedOutputSha256: sha("different-output") })],
    ["model observation", (proof: AgentRuntimeExecutionAttestation): AgentRuntimeExecutionAttestation => proof.runtimeEngine === "gateway-llm"
      ? { ...proof, gateway: { ...proof.gateway, observedModel: "gpt-5.6-sol" } } : proof],
  ])("rejects tampered %s before exposing durable execution proof", async (_label, change) => {
    const model = new AgentRuntimeReaderSummaryWeeklyTextModel({ client: runtime(change), executionProfile: profile });
    await expect(model.generate(completeModelInput())).rejects.toThrow();
    expect(() => model.getGatewayExecutionProof()).toThrow("lacks verified execution proof");
  });

  it("fails closed on a partial switch or an unapproved weekly profile", () => {
    const env = { AGENT_RUNTIME_TRANSPORT: "gateway-llm", AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "gpt-6.1-terra",
      AGENT_RUNTIME_GATEWAY_LLM_ACCOUNT_REFS: "test_account", AGENT_RUNTIME_GATEWAY_LLM_POLICY_SUBJECT_REF: "test_subject",
      AGENT_RUNTIME_GATEWAY_LLM_POLICY_REVISION: "1", AGENT_RUNTIME_GATEWAY_LLM_BINDING_REVISION: "1",
      AGENT_RUNTIME_GATEWAY_LLM_CONTROL_ORIGIN: "https://gateway.test", AGENT_RUNTIME_GATEWAY_LLM_CONTROL_TOKEN_FILE: "/test/not-read" };
    expect(resolveReaderSummaryWeeklyExecutionProfile(env)).toEqual(profile);
    expect(resolveReaderSummaryWeeklyExecutionProfile({ ...env, AGENT_RUNTIME_GATEWAY_LLM_MODEL: "" }))
      .toMatchObject({ model: "gpt-6.1-terra", reasoningEffort: "medium" });
    expect(() => resolveReaderSummaryWeeklyExecutionProfile({ ...env, AGENT_RUNTIME_GATEWAY_LLM_PROFILE_ID: "test_other_profile" })).toThrow("approved Codex gateway profile");
    expect(() => resolveReaderSummaryWeeklyExecutionProfile({ ...env, AGENT_RUNTIME_READER_SUMMARY_BACKEND: "" })).toThrow();
    expect(resolveReaderSummaryWeeklyExecutionProfile({ AGENT_RUNTIME_TRANSPORT: "agent-runtime" }))
      .toMatchObject({ transport: "agent-runtime", model: "gpt-5.6-sol", reasoningEffort: "high" });
  });
});
