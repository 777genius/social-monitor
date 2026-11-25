import {
  canonicalJsonSha256,
  executionAttestationOutputMatches,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import {
  assertReaderSummaryWeeklyExactObject,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { isCodexGatewayReaderSummaryRoute } from "../../libs/summary/adapters/model/codex-reader-summary-route";
import { parseOpenAiReaderSummaryWeeklyValue } from "../../libs/summary/adapters/model/openai-responses-reader-summary-weekly-response-parser";
import type {
  AgentRuntimeExecutionAttestation,
} from "../../libs/summary/ports/agent-runtime-client.port";
import type {
  ReaderSummaryWeeklyModelInput,
  ReaderSummaryWeeklyModelOutput,
} from "../../libs/summary/ports/reader-summary-weekly-model.port";
import { assertReaderSummaryWeeklyCommandExecution } from "./reader-summary-weekly-execution-profile";
import { buildReaderSummaryWeeklyGenerationCommand } from "./reader-summary-weekly-production-model";

export type ReaderSummaryWeeklyGatewayProductionProof = Readonly<{
  provider: "gateway-llm";
  agentProvider: "codex";
  model: string;
  reasoningEffort: string;
  runtimeOutput: "structured_output";
  gatewayMinOutputTokens: number;
  maxOutputTokens: number;
  executionAttestation: Extract<AgentRuntimeExecutionAttestation, { runtimeEngine: "gateway-llm" }>;
  rawStructuredOutput: Record<string, unknown>;
}>;
export type ReaderSummaryWeeklyLegacyProductionProof = Readonly<{
  provider: "agent-runtime"; agentProvider: "codex"; model: "gpt-5.6-sol";
  reasoningEffort: "high"; runtimeOutput: "output_text";
}>;
export type ReaderSummaryWeeklyProductionModelProof =
  ReaderSummaryWeeklyLegacyProductionProof | ReaderSummaryWeeklyGatewayProductionProof;
export const legacyReaderSummaryWeeklyProductionModelProof: ReaderSummaryWeeklyLegacyProductionProof = Object.freeze({
  provider: "agent-runtime", agentProvider: "codex", model: "gpt-5.6-sol",
  reasoningEffort: "high", runtimeOutput: "output_text",
});

/** Replays only the saved selected output; never invokes a model to repair uncertain evidence. */
export const assertReaderSummaryWeeklyProductionModelProof = (
  proof: ReaderSummaryWeeklyProductionModelProof,
  input: ReaderSummaryWeeklyModelInput,
  normalizedOutput: ReaderSummaryWeeklyModelOutput,
): void => {
  if (proof.provider === "agent-runtime") {
    if (proof.agentProvider !== "codex" || proof.model !== "gpt-5.6-sol" ||
        proof.reasoningEffort !== "high" || proof.runtimeOutput !== "output_text") {
      throw new Error("Reader summary weekly legacy model proof diverged");
    }
    return;
  }
  assertReaderSummaryWeeklyExactObject(proof, ["provider", "agentProvider", "model", "reasoningEffort", "runtimeOutput", "gatewayMinOutputTokens", "maxOutputTokens", "executionAttestation", "rawStructuredOutput"], "weekly generation gateway model proof");
  if (proof.provider !== "gateway-llm" || proof.agentProvider !== "codex" ||
      !isCodexGatewayReaderSummaryRoute(proof.model, proof.reasoningEffort) ||
      proof.runtimeOutput !== "structured_output" ||
      !Number.isSafeInteger(proof.maxOutputTokens) || proof.maxOutputTokens < 1 || proof.maxOutputTokens > 65_536 ||
      !Number.isSafeInteger(proof.gatewayMinOutputTokens) || proof.gatewayMinOutputTokens < 1 || proof.gatewayMinOutputTokens > 65_536) {
    throw new Error("Reader summary weekly gateway model proof diverged");
  }
  const attestation = proof.executionAttestation;
  assertReaderSummaryWeeklyExactObject(attestation, ["schemaVersion", "requestId", "purpose", "canonicalRequestSha256", "provider", "model", "reasoningEffort", "runtimeEngine", "runtimePackageVersion", "launcherSha256", "selectedOutputKind", "selectedOutputSha256", "gateway"], "weekly generation execution attestation", { allowAuthoritativeHashes: true });
  const command = buildReaderSummaryWeeklyGenerationCommand(input, {
    provider: "codex", model: proof.model, reasoningEffort: proof.reasoningEffort,
    maxOutputTokens: proof.maxOutputTokens, timeoutMs: 600_000, transport: "gateway-llm",
  });
  assertReaderSummaryWeeklyCommandExecution(command, attestation, {
    transport: "gateway-llm", model: proof.model, reasoningEffort: proof.reasoningEffort,
    gatewayMinOutputTokens: proof.gatewayMinOutputTokens,
  });
  if (attestation.schemaVersion !== 1 || attestation.requestId !== command.requestId ||
      attestation.purpose !== command.purpose || attestation.provider !== "codex" ||
      attestation.model !== proof.model || attestation.reasoningEffort !== proof.reasoningEffort ||
      attestation.selectedOutputKind !== "structured_output" ||
      !executionAttestationOutputMatches(attestation, { structuredOutput: proof.rawStructuredOutput }) ||
      canonicalJsonSha256(parseOpenAiReaderSummaryWeeklyValue(input, proof.rawStructuredOutput)) !==
        canonicalJsonSha256(normalizedOutput)) {
    throw new Error("Reader summary weekly gateway selected output proof diverged");
  }
};
