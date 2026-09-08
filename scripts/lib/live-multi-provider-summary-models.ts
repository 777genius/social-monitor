import { writeFileSync } from "node:fs";
import { OpenAiSourceContentQualityReviewerAdapter } from "@social-monitor/relevance/adapters/model/openai-source-content-quality-reviewer.adapter";
import { resolveRelevanceContentQualityOpenAiOptions, resolveRelevanceContentQualityReviewerMode } from "@social-monitor/relevance/interfaces/rest/relevance-provider-tokens";
import { NOOP_SOURCE_CONTENT_QUALITY_REVIEWER, type SourceContentQualityReviewerPort } from "@social-monitor/relevance/ports";
import { SystemClock } from "@social-monitor/shared-kernel";
import { DeterministicSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-summary-model.adapter";
import { DeterministicReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-reader-summary-model.adapter";
import { OpenAiResponsesReaderSummaryModelAdapter, resolveOpenAiResponsesReaderSummaryModelOptions } from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-model.adapter";
import { OpenAiResponsesSummaryModelAdapter, resolveOpenAiResponsesSummaryModelOptions } from "@social-monitor/summary/adapters/model/openai-responses-summary-model.adapter";
import { buildInstructions as buildSummaryInstructions, buildPromptPayload as buildSummaryPromptPayload } from "@social-monitor/summary/adapters/model/openai-responses-summary-prompt";
import { openAiSummaryJsonSchema } from "@social-monitor/summary/adapters/model/openai-responses-summary-schema";
import { AgentRuntimeReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-model.adapter";
import { AgentRuntimeSummaryModelAdapter } from "@social-monitor/summary/adapters/model/agent-runtime-summary-model.adapter";
import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import type { ReaderSummaryModelPort, SummaryModelPort } from "@social-monitor/summary/ports";
import { summaryModelMode, readOptionalEnv, readPositiveIntegerEnv, liveSummaryMaxOutputTokens, summaryPromptDebugPathEnv, readerSummaryModelMode, liveReaderSummaryMaxOutputTokens, liveSummaryMaxInputTokens, liveSummaryBudgetTokens, liveReaderSummaryMaxInputTokens, liveReaderSummaryBudgetTokens } from "./live-multi-provider-summary-config";

export const buildSummaryModel = (): SummaryModelPort => {
  if (summaryModelMode === "deterministic") {
    return new DeterministicSummaryModelAdapter();
  }

  if (summaryModelMode === "agent-runtime") {
    return new LiveBudgetSummaryModel(
      new AgentRuntimeSummaryModelAdapter({
        client: buildAgentRuntimeClient("summary"),
        agentProvider: readAgentRuntimeProvider(),
        providerInstanceId: readOptionalEnv(
          "AGENT_RUNTIME_PROVIDER_INSTANCE_ID",
        ),
        model: readOptionalEnv("LIVE_MULTI_PROVIDER_AGENT_RUNTIME_MODEL"),
        timeoutMs: readPositiveIntegerEnv(
          "AGENT_RUNTIME_SUMMARY_TIMEOUT_MS",
          180_000,
          1_000,
          600_000,
        ),
        maxOutputTokens: liveSummaryMaxOutputTokens,
      }),
    );
  }

  return new LiveBudgetSummaryModel(
    new OpenAiResponsesSummaryModelAdapter(
      resolveOpenAiResponsesSummaryModelOptions(process.env, {
        requireApiKey: true,
      }),
    ),
  );
};

export const maybeWrapSummaryPromptDebugModel = (
  model: SummaryModelPort,
): SummaryModelPort => {
  const debugPath = readOptionalEnv(summaryPromptDebugPathEnv);
  if (debugPath === undefined) {
    return model;
  }

  return new DebugDumpSummaryPromptModel(model, debugPath);
};

class DebugDumpSummaryPromptModel implements SummaryModelPort {
  constructor(
    private readonly delegate: SummaryModelPort,
    private readonly debugPath: string,
  ) {}

  route(
    input: Parameters<SummaryModelPort["route"]>[0],
    policy: Parameters<SummaryModelPort["route"]>[1],
    budget: Parameters<SummaryModelPort["route"]>[2],
  ): ReturnType<SummaryModelPort["route"]> {
    return this.delegate.route(input, policy, budget);
  }

  estimate(
    input: Parameters<SummaryModelPort["estimate"]>[0],
    route: Parameters<SummaryModelPort["estimate"]>[1],
  ): ReturnType<SummaryModelPort["estimate"]> {
    return this.delegate.estimate(input, route);
  }

  summarize(
    input: Parameters<SummaryModelPort["summarize"]>[0],
    route: Parameters<SummaryModelPort["summarize"]>[1],
  ): ReturnType<SummaryModelPort["summarize"]> {
    writeFileSync(
      this.debugPath,
      JSON.stringify(
        {
          systemPrompt: buildSummaryInstructions(input),
          prompt: buildSummaryPromptPayload(input),
          outputSchema: openAiSummaryJsonSchema,
          route,
        },
        null,
        2,
      ),
      "utf8",
    );

    return this.delegate.summarize(input, route);
  }

  validateRawProviderResponse(
    attempt: Parameters<SummaryModelPort["validateRawProviderResponse"]>[0],
  ): ReturnType<SummaryModelPort["validateRawProviderResponse"]> {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(
    error: Parameters<SummaryModelPort["classifyError"]>[0],
  ): ReturnType<SummaryModelPort["classifyError"]> {
    return this.delegate.classifyError(error);
  }
}

export const buildReaderSummaryModel = (): ReaderSummaryModelPort => {
  if (readerSummaryModelMode === "deterministic") {
    return new DeterministicReaderSummaryModelAdapter();
  }

  if (readerSummaryModelMode === "agent-runtime") {
    return new LiveBudgetReaderSummaryModel(
      new AgentRuntimeReaderSummaryModelAdapter({
        client: buildAgentRuntimeClient("reader-summary"),
        agentProvider: readAgentRuntimeProvider(),
        providerInstanceId: readOptionalEnv(
          "AGENT_RUNTIME_PROVIDER_INSTANCE_ID",
        ),
        model: readOptionalEnv(
          "LIVE_MULTI_PROVIDER_AGENT_RUNTIME_READER_MODEL",
        ),
        timeoutMs: readPositiveIntegerEnv(
          "AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS",
          240_000,
          1_000,
          600_000,
        ),
        maxOutputTokens: liveReaderSummaryMaxOutputTokens,
      }),
    );
  }

  return new LiveBudgetReaderSummaryModel(
    new OpenAiResponsesReaderSummaryModelAdapter(
      resolveOpenAiResponsesReaderSummaryModelOptions(process.env, {
        requireApiKey: true,
      }),
    ),
  );
};

const buildAgentRuntimeClient = (service: string): GrpcAgentRuntimeClient =>
  GrpcAgentRuntimeClient.connect({
    address: readOptionalEnv("AGENT_RUNTIME_GRPC_ADDRESS") ?? "127.0.0.1:50052",
    clock: new SystemClock(),
    options: {
      timeoutMs: readPositiveIntegerEnv(
        "AGENT_RUNTIME_TIMEOUT_MS",
        service === "reader-summary" ? 240_000 : 180_000,
        1_000,
        600_000,
      ),
      serviceToken: readOptionalEnv("AGENT_RUNTIME_SERVICE_TOKEN"),
    },
  });

const readAgentRuntimeProvider = (): "codex" | "claude" => {
  const value = readOptionalEnv("AGENT_RUNTIME_PROVIDER") ?? "codex";
  if (value === "codex" || value === "claude") {
    return value;
  }

  throw new Error('AGENT_RUNTIME_PROVIDER must be "codex" or "claude"');
};

class LiveBudgetSummaryModel implements SummaryModelPort {
  constructor(private readonly delegate: SummaryModelPort) {}

  route(
    input: Parameters<SummaryModelPort["route"]>[0],
    policy: Parameters<SummaryModelPort["route"]>[1],
    budget: Parameters<SummaryModelPort["route"]>[2],
  ): ReturnType<SummaryModelPort["route"]> {
    return this.delegate.route(
      input,
      {
        ...policy,
        maxInputTokens: Math.max(
          policy.maxInputTokens,
          liveSummaryMaxInputTokens,
        ),
        maxOutputTokens: Math.max(
          policy.maxOutputTokens,
          liveSummaryMaxOutputTokens,
        ),
      },
      {
        ...budget,
        remainingTokens: Math.max(
          budget.remainingTokens,
          liveSummaryBudgetTokens,
        ),
      },
    );
  }

  estimate(
    input: Parameters<SummaryModelPort["estimate"]>[0],
    route: Parameters<SummaryModelPort["estimate"]>[1],
  ): ReturnType<SummaryModelPort["estimate"]> {
    return this.delegate.estimate(input, route);
  }

  summarize(
    input: Parameters<SummaryModelPort["summarize"]>[0],
    route: Parameters<SummaryModelPort["summarize"]>[1],
  ): ReturnType<SummaryModelPort["summarize"]> {
    return this.delegate.summarize(input, route);
  }

  validateRawProviderResponse(
    attempt: Parameters<SummaryModelPort["validateRawProviderResponse"]>[0],
  ): ReturnType<SummaryModelPort["validateRawProviderResponse"]> {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(
    error: Parameters<SummaryModelPort["classifyError"]>[0],
  ): ReturnType<SummaryModelPort["classifyError"]> {
    return this.delegate.classifyError(error);
  }
}

class LiveBudgetReaderSummaryModel implements ReaderSummaryModelPort {
  constructor(private readonly delegate: ReaderSummaryModelPort) {}

  route(
    input: Parameters<ReaderSummaryModelPort["route"]>[0],
    policy: Parameters<ReaderSummaryModelPort["route"]>[1],
    budget: Parameters<ReaderSummaryModelPort["route"]>[2],
  ): ReturnType<ReaderSummaryModelPort["route"]> {
    return this.delegate.route(
      input,
      {
        ...policy,
        maxInputTokens: Math.max(
          policy.maxInputTokens,
          liveReaderSummaryMaxInputTokens,
        ),
        maxOutputTokens: Math.max(
          policy.maxOutputTokens,
          liveReaderSummaryMaxOutputTokens,
        ),
      },
      {
        ...budget,
        remainingTokens: Math.max(
          budget.remainingTokens,
          liveReaderSummaryBudgetTokens,
        ),
      },
    );
  }

  estimate(
    input: Parameters<ReaderSummaryModelPort["estimate"]>[0],
    route: Parameters<ReaderSummaryModelPort["estimate"]>[1],
  ): ReturnType<ReaderSummaryModelPort["estimate"]> {
    return this.delegate.estimate(input, route);
  }

  generate(
    input: Parameters<ReaderSummaryModelPort["generate"]>[0],
    route: Parameters<ReaderSummaryModelPort["generate"]>[1],
  ): ReturnType<ReaderSummaryModelPort["generate"]> {
    return this.delegate.generate(input, route);
  }

  validateRawProviderResponse(
    attempt: Parameters<
      ReaderSummaryModelPort["validateRawProviderResponse"]
    >[0],
  ): ReturnType<ReaderSummaryModelPort["validateRawProviderResponse"]> {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(
    error: Parameters<ReaderSummaryModelPort["classifyError"]>[0],
  ): ReturnType<ReaderSummaryModelPort["classifyError"]> {
    return this.delegate.classifyError(error);
  }
}

export const buildSourceContentQualityReviewer =
  (): SourceContentQualityReviewerPort => {
    const mode = resolveRelevanceContentQualityReviewerMode(process.env);

    if (mode === "disabled") {
      return NOOP_SOURCE_CONTENT_QUALITY_REVIEWER;
    }

    return new OpenAiSourceContentQualityReviewerAdapter(
      resolveRelevanceContentQualityOpenAiOptions(process.env, {
        requireApiKey: true,
      }),
    );
  };
