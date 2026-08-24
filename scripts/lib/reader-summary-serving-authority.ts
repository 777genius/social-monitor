import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports";

import { probeProductionRuntimeLiveIdentity } from "./reader-summary-runtime-live-identity";

type ReaderSummaryComponentAuthority<Mode extends string> = Readonly<{
  mode: Mode;
  provider: string;
  physicalModel: string;
  reasoningPolicy: string;
}>;

export type ReaderSummaryServingAuthority = Readonly<{
  summaryGenerator: ReaderSummaryComponentAuthority<
    "deterministic" | "openai-responses" | "agent-runtime"
  >;
  topicLabeler: ReaderSummaryComponentAuthority<
    "deterministic" | "agent-runtime"
  >;
  topicRelationVerifier: ReaderSummaryComponentAuthority<
    "deterministic" | "agent-runtime"
  >;
  runtime: Readonly<{
    engine: string;
    packageVersion: string;
    launcherSha256: string;
  }> | null;
}>;

type SummaryModelMode = ReaderSummaryServingAuthority["summaryGenerator"]["mode"];
type TopicLabelerMode = ReaderSummaryServingAuthority["topicLabeler"]["mode"];

export const readerSummaryServingAuthorityRequiresAgentRuntime = (input: {
  readonly summaryModelMode: SummaryModelMode;
  readonly topicLabelerMode: TopicLabelerMode;
}): boolean => input.summaryModelMode === "agent-runtime" ||
  input.topicLabelerMode === "agent-runtime";

export const resolveReaderSummaryServingAuthority = async (input: {
  readonly summaryModelMode: SummaryModelMode;
  readonly topicLabelerMode: TopicLabelerMode;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly agentRuntimeClient: Pick<AgentRuntimeClientPort, "checkHealth"> | null;
  readonly checkedAt: string;
}): Promise<ReaderSummaryServingAuthority> => {
  const usesAgentRuntime = readerSummaryServingAuthorityRequiresAgentRuntime(input);
  const agentProvider = usesAgentRuntime
    ? resolveAgentProvider(input.env.AGENT_RUNTIME_PROVIDER)
    : null;
  const runtime = usesAgentRuntime
    ? await resolveRuntime(input.agentRuntimeClient, input.checkedAt)
    : null;

  return Object.freeze({
    summaryGenerator: summaryAuthority(input, agentProvider),
    topicLabeler: topicLabelerAuthority(input, agentProvider),
    topicRelationVerifier: topicRelationVerifierAuthority(input, agentProvider),
    runtime,
  });
};

const summaryAuthority = (
  input: Parameters<typeof resolveReaderSummaryServingAuthority>[0],
  agentProvider: string | null,
): ReaderSummaryServingAuthority["summaryGenerator"] => {
  if (input.summaryModelMode === "agent-runtime") {
    const reasoningPolicy = configured(
      input.env.AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT ??
        input.env.AGENT_RUNTIME_REASONING_EFFORT,
      "high",
    );
    if (reasoningPolicy !== "high") {
      throw new Error("Current reader summary reasoning effort is invalid");
    }
    return Object.freeze({
      mode: input.summaryModelMode,
      provider: requiredAgentProvider(agentProvider),
      physicalModel: activePhysicalModel(configured(
        input.env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
        "gpt-5.6-sol",
      )),
      reasoningPolicy,
    });
  }
  if (input.summaryModelMode === "openai-responses") {
    return Object.freeze({
      mode: input.summaryModelMode,
      provider: "openai-responses",
      physicalModel: configured(
        input.env.OPENAI_READER_SUMMARY_MODEL ?? input.env.OPENAI_SUMMARY_MODEL,
        "gpt-5.4-mini",
      ),
      reasoningPolicy: "not-applicable",
    });
  }
  return Object.freeze({
    mode: input.summaryModelMode,
    provider: "deterministic",
    physicalModel: "deterministic-reader-summary-v1",
    reasoningPolicy: "not-applicable",
  });
};

const topicLabelerAuthority = (
  input: Parameters<typeof resolveReaderSummaryServingAuthority>[0],
  agentProvider: string | null,
): ReaderSummaryServingAuthority["topicLabeler"] => Object.freeze(
  input.topicLabelerMode === "agent-runtime"
    ? {
        mode: input.topicLabelerMode,
        provider: requiredAgentProvider(agentProvider),
        physicalModel: activePhysicalModel(configured(
          input.env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MODEL ??
            input.env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
          "gpt-5.6-sol",
        )),
        reasoningPolicy: "high",
      }
    : {
        mode: input.topicLabelerMode,
        provider: "deterministic",
        physicalModel: "deterministic-reader-summary-topic-labeler-v1",
        reasoningPolicy: "not-applicable",
      },
);

const topicRelationVerifierAuthority = (
  input: Parameters<typeof resolveReaderSummaryServingAuthority>[0],
  agentProvider: string | null,
): ReaderSummaryServingAuthority["topicRelationVerifier"] => Object.freeze(
  input.topicLabelerMode === "agent-runtime"
    ? {
        mode: input.topicLabelerMode,
        provider: requiredAgentProvider(agentProvider),
        physicalModel: activePhysicalModel(configured(
          input.env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_MODEL ??
            input.env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
          "gpt-5.6-sol",
        )),
        reasoningPolicy: "high",
      }
    : {
        mode: input.topicLabelerMode,
        provider: "deterministic",
        physicalModel: "deterministic-reader-summary-topic-relation-verifier-v1",
        reasoningPolicy: "not-applicable",
      },
);

const resolveRuntime = async (
  client: Pick<AgentRuntimeClientPort, "checkHealth"> | null,
  checkedAt: string,
): Promise<NonNullable<ReaderSummaryServingAuthority["runtime"]>> => {
  if (client === null) {
    throw new Error("Current agent-runtime serving authority is required");
  }
  const live = await probeProductionRuntimeLiveIdentity({ client, checkedAt });
  return Object.freeze({
    engine: live.runtimeEngine,
    packageVersion: live.runtimePackageVersion,
    launcherSha256: live.launcherSha256,
  });
};

const resolveAgentProvider = (configuredProvider: string | undefined): string => {
  const provider = configured(configuredProvider, "codex");
  if (provider !== "codex") {
    throw new Error("Current reader-summary agent-runtime provider must be codex");
  }
  return provider;
};

const requiredAgentProvider = (provider: string | null): string => {
  if (provider === null) throw new Error("Agent-runtime provider is required");
  return provider;
};

const activePhysicalModel = (model: string): "gpt-5.6-sol" => {
  if (model !== "gpt-5.6-sol") {
    throw new Error("Current reader-summary physical model must be gpt-5.6-sol");
  }
  return model;
};

const configured = (value: string | undefined, fallback: string): string => {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? fallback
    : normalized;
};
