import {
  isAttestedRuntimeIdentity,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import {
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  resolveCodexGatewayReaderSummaryRoute,
} from "../../libs/summary/adapters/model/active-reader-summary-generation-profile";
import {
  resolveGatewayLlmTransportConfig,
  resolveSummaryAgentRuntimeTransport,
} from "../../libs/summary/adapters/composition/reader-summary-agent-runtime-transport";
import { gatewayLlmCanonicalRequestSha256 } from "../../libs/summary/adapters/model/gateway-llm/gateway-llm-request-identity";
import { approvedGatewayLlmSdkIdentity } from "../../libs/summary/adapters/model/gateway-llm/gateway-llm-sdk-identity";
import type {
  AgentRuntimeExecutionAttestation,
  AgentRuntimeTaskCommand,
} from "../../libs/summary/ports/agent-runtime-client.port";

export type ReaderSummaryWeeklyExecutionProfile = Readonly<{
  transport: "agent-runtime" | "gateway-llm";
  model: string;
  reasoningEffort: string;
  gatewayMinOutputTokens?: number;
}>;
export const legacyReaderSummaryWeeklyExecutionProfile: ReaderSummaryWeeklyExecutionProfile = Object.freeze({
  transport: "agent-runtime", model: activeReaderSummaryModel,
  reasoningEffort: activeReaderSummaryReasoningEffort,
});
export const readerSummaryWeeklyGatewayProfileId = "openai-codex-oauth-responses-v1";

/** Weekly receipts admit only the Codex route; a partial switch fails before a model call. */
export const resolveReaderSummaryWeeklyExecutionProfile = (
  env: NodeJS.ProcessEnv,
): ReaderSummaryWeeklyExecutionProfile => {
  if (resolveSummaryAgentRuntimeTransport(env) === "agent-runtime") {
    if (env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim() &&
        env.AGENT_RUNTIME_READER_SUMMARY_BACKEND.trim() !== "openai-chatgpt") {
      throw new Error("Weekly summaries require the Codex backend");
    }
    return legacyReaderSummaryWeeklyExecutionProfile;
  }
  const route = resolveCodexGatewayReaderSummaryRoute(env);
  const config = resolveGatewayLlmTransportConfig(env);
  if (route === undefined || config.route.profileId !== readerSummaryWeeklyGatewayProfileId) {
    throw new Error("Weekly summaries require the approved Codex gateway profile");
  }
  return Object.freeze({ transport: "gateway-llm", ...route,
    gatewayMinOutputTokens: config.route.minOutputTokens });
};

/** Historical manifests keep their byte identity; gateway reads still bind the approved SDK. */
export const assertReaderSummaryWeeklyRuntimeIdentity = (
  attestation: AgentRuntimeExecutionAttestation,
): void => {
  if (attestation.runtimeEngine !== "gateway-llm") return;
  if (!isAttestedRuntimeIdentity(attestation) ||
      attestation.gateway.profileId !== readerSummaryWeeklyGatewayProfileId ||
      attestation.runtimePackageVersion !== approvedGatewayLlmSdkIdentity.packageVersion ||
      attestation.launcherSha256 !== approvedGatewayLlmSdkIdentity.archiveSha256) {
    throw new Error("Reader summary weekly gateway execution identity is invalid");
  }
};

/** Recompute the exact gateway canonical request from the selected route and sealed prompt. */
export const assertReaderSummaryWeeklyCommandExecution = (
  command: AgentRuntimeTaskCommand,
  attestation: AgentRuntimeExecutionAttestation,
  profile: ReaderSummaryWeeklyExecutionProfile,
): void => {
  if (attestation.runtimeEngine !== (profile.transport === "gateway-llm"
    ? "gateway-llm" : "subscription-runtime-cli")) {
    throw new Error("Reader summary weekly execution transport diverged");
  }
  assertReaderSummaryWeeklyRuntimeIdentity(attestation);
  if (attestation.runtimeEngine !== "gateway-llm") return;
  if (!Number.isSafeInteger(profile.gatewayMinOutputTokens) || profile.gatewayMinOutputTokens! < 1 ||
      attestation.canonicalRequestSha256 !== gatewayLlmCanonicalRequestSha256(command, {
        profileId: readerSummaryWeeklyGatewayProfileId, model: profile.model,
        reasoningEffort: profile.reasoningEffort as "low" | "medium" | "high",
        minOutputTokens: profile.gatewayMinOutputTokens!,
      })) {
    throw new Error("Reader summary weekly gateway canonical request diverged");
  }
};
