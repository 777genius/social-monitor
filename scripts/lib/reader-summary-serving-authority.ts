import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports";

import { probeProductionRuntimeLiveIdentity } from "./reader-summary-runtime-live-identity";

export type ReaderSummaryServingAuthority = Readonly<{
  summaryModelMode: "deterministic" | "openai-responses" | "agent-runtime";
  topicLabelerMode: "deterministic" | "agent-runtime";
  provider: string;
  physicalModel: string;
  reasoningEffort: string;
  runtimeEngine: string;
  runtimePackageVersion: string;
  launcherSha256: string;
}>;

export const readerSummaryServingAuthorityRequiresAgentRuntime = (input: {
  readonly summaryModelMode: ReaderSummaryServingAuthority["summaryModelMode"];
  readonly topicLabelerMode: ReaderSummaryServingAuthority["topicLabelerMode"];
}): boolean => input.summaryModelMode === "agent-runtime" ||
  input.topicLabelerMode === "agent-runtime";

export const resolveReaderSummaryServingAuthority = async (input: {
  readonly summaryModelMode: ReaderSummaryServingAuthority["summaryModelMode"];
  readonly topicLabelerMode: ReaderSummaryServingAuthority["topicLabelerMode"];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly agentRuntimeClient: Pick<AgentRuntimeClientPort, "checkHealth"> | null;
  readonly checkedAt: string;
}): Promise<ReaderSummaryServingAuthority> => {
  const usesAgentRuntime = readerSummaryServingAuthorityRequiresAgentRuntime(input);
  if (!usesAgentRuntime) return directAuthority(input);
  if (input.agentRuntimeClient === null) {
    throw new Error("Current agent-runtime serving authority is required");
  }
  const live = await probeProductionRuntimeLiveIdentity({
    client: input.agentRuntimeClient,
    checkedAt: input.checkedAt,
  });
  const configuredProvider = input.env.AGENT_RUNTIME_PROVIDER;
  const provider = configuredProvider === undefined ||
      configuredProvider.trim().length === 0
    ? "codex"
    : configuredProvider;
  if (provider !== "codex" && provider !== "claude") {
    throw new Error("Current agent-runtime provider is invalid");
  }
  const reasoningEffort = configured(
    input.env.AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT ??
      input.env.AGENT_RUNTIME_REASONING_EFFORT,
    "xhigh",
  );
  if (reasoningEffort !== "xhigh") {
    throw new Error("Current reader summary reasoning effort is invalid");
  }
  return Object.freeze({
    summaryModelMode: input.summaryModelMode,
    topicLabelerMode: input.topicLabelerMode,
    provider,
    physicalModel: input.summaryModelMode === "agent-runtime"
      ? configured(input.env.AGENT_RUNTIME_READER_SUMMARY_MODEL, "gpt-5.6-sol")
      : configured(
          input.env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MODEL,
          "agent-runtime-reader-summary-topic-labeler",
        ),
    reasoningEffort,
    runtimeEngine: live.runtimeEngine,
    runtimePackageVersion: live.runtimePackageVersion,
    launcherSha256: live.launcherSha256,
  });
};

const directAuthority = (input: {
  readonly summaryModelMode: ReaderSummaryServingAuthority["summaryModelMode"];
  readonly topicLabelerMode: ReaderSummaryServingAuthority["topicLabelerMode"];
  readonly env: Readonly<Record<string, string | undefined>>;
}): ReaderSummaryServingAuthority => Object.freeze({
  summaryModelMode: input.summaryModelMode,
  topicLabelerMode: input.topicLabelerMode,
  provider: input.summaryModelMode === "openai-responses"
    ? "openai-responses"
    : "deterministic",
  physicalModel: input.summaryModelMode === "openai-responses"
    ? configured(
        input.env.OPENAI_READER_SUMMARY_MODEL ?? input.env.OPENAI_SUMMARY_MODEL,
        "gpt-5.4-mini",
      )
    : "deterministic-reader-summary-v1",
  reasoningEffort: "not-applicable",
  runtimeEngine: "in-process",
  runtimePackageVersion: "social-monitor-in-process-v1",
  launcherSha256: "not-applicable",
});

const configured = (value: string | undefined, fallback: string): string => {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? fallback
    : normalized;
};
