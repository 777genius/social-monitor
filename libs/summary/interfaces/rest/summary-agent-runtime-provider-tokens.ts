import type { Provider } from "@nestjs/common";
import { assertRuntimeProfileAllowsMode } from "@social-monitor/platform-config";
import { CryptoIdGenerator, SystemClock } from "@social-monitor/shared-kernel";

import {
  createReaderSummaryAgentRuntimeClient,
  type ReaderSummaryAgentRuntimeTransport,
} from "../../adapters/composition/reader-summary-agent-runtime-transport";
import {
  resolveAgentRuntimePromotionPresentationV3BuilderOptions,
  type AgentRuntimePromotionPresentationV3BuilderOptions,
} from "../../adapters/model/agent-runtime-promotion-presentation-v3.builder";
import {
  resolveAgentRuntimeReaderSummaryModelOptions,
  type AgentRuntimeReaderSummaryModelAdapterOptions,
} from "../../adapters/model/agent-runtime-reader-summary-model.adapter";
import {
  resolveAgentRuntimeReaderSummaryTopicLabelerOptions,
  type AgentRuntimeReaderSummaryTopicLabelerOptions,
} from "../../adapters/model/agent-runtime-reader-summary-topic-labeler.adapter";
import {
  resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions,
  type AgentRuntimeReaderSummaryTopicRelationVerifierOptions,
} from "../../adapters/model/agent-runtime-reader-summary-topic-relation-verifier.adapter";
import {
  resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions,
  type AgentRuntimeReaderSummaryStoryRelationVerifierOptions,
} from "../../adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter";
import {
  resolveAgentRuntimeSummaryModelOptions,
  type AgentRuntimeSummaryModelAdapterOptions,
} from "../../adapters/model/agent-runtime-summary-model.adapter";
import { GrpcAgentRuntimeClient, validateAgentRuntimeDefaultCwd } from "../../adapters/model/grpc-agent-runtime-client";
import type { AgentRuntimeClientPort } from "../../ports";
import {
  READER_SUMMARY_MODEL_PROVIDER_MODE,
  READER_SUMMARY_TOPIC_LABELER_MODE,
  SUMMARY_MODEL_PROVIDER_MODE,
  type ReaderSummaryModelProviderMode,
  type ReaderSummaryTopicLabelerMode,
  type SummaryModelProviderMode,
} from "./summary-provider-tokens";

export const SUMMARY_AGENT_RUNTIME_CLIENT_OPTIONS = Symbol(
  "SUMMARY_AGENT_RUNTIME_CLIENT_OPTIONS",
);
/** Agent-runtime port of every reader-summary model task, on the selected transport. */
export const SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT = Symbol(
  "SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT",
);
export const SUMMARY_AGENT_RUNTIME_SUMMARY_MODEL_OPTIONS = Symbol(
  "SUMMARY_AGENT_RUNTIME_SUMMARY_MODEL_OPTIONS",
);
export const SUMMARY_AGENT_RUNTIME_READER_SUMMARY_MODEL_OPTIONS = Symbol(
  "SUMMARY_AGENT_RUNTIME_READER_SUMMARY_MODEL_OPTIONS",
);
export const SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_OPTIONS =
  Symbol("SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_OPTIONS");
export const SUMMARY_AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_OPTIONS =
  Symbol("SUMMARY_AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_OPTIONS");
export const SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_OPTIONS =
  Symbol(
    "SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_OPTIONS",
  );
export const SUMMARY_AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_OPTIONS =
  Symbol(
    "SUMMARY_AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_OPTIONS",
  );

export type SummaryAgentRuntimeClientOptions = {
  readonly address: string;
  readonly timeoutMs: number;
  readonly serviceToken?: string;
  readonly defaultCwd?: string;
};

export const summaryAgentRuntimeClientOptionsProvider: Provider<SummaryAgentRuntimeClientOptions> =
  {
    provide: SUMMARY_AGENT_RUNTIME_CLIENT_OPTIONS,
    useFactory: (
      summaryMode: SummaryModelProviderMode,
      readerSummaryMode: ReaderSummaryModelProviderMode,
      topicLabelerMode: ReaderSummaryTopicLabelerMode,
    ) =>
      resolveSummaryAgentRuntimeClientOptions(process.env, {
        // Reader-summary tasks need the gRPC runtime only on its own transport.
        requireAddress:
          summaryMode === "agent-runtime" ||
          (resolveReaderSummaryAgentRuntimeTransport(process.env) === "agent-runtime" && (
            readerSummaryMode === "agent-runtime" ||
            topicLabelerMode === "agent-runtime" ||
            (process.env.READER_VALUE_MODE ??
              (process.env.NODE_ENV === "test" ? "legacy_v2" : "jev_primary_v3")) === "jev_primary_v3")),
      }),
    inject: [
      SUMMARY_MODEL_PROVIDER_MODE,
      READER_SUMMARY_MODEL_PROVIDER_MODE,
      READER_SUMMARY_TOPIC_LABELER_MODE,
    ],
  };

export const summaryReaderSummaryAgentRuntimeClientProvider: Provider<AgentRuntimeClientPort> = {
  provide: SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT,
  useFactory: (grpc: GrpcAgentRuntimeClient): AgentRuntimeClientPort =>
    createReaderSummaryAgentRuntimeClient({
      transport: resolveReaderSummaryAgentRuntimeTransport(process.env),
      env: process.env,
      clock: new SystemClock(),
      runId: new CryptoIdGenerator().generate(),
      agentRuntime: () => grpc,
    }),
  inject: [GrpcAgentRuntimeClient],
};

export const summaryAgentRuntimeSummaryModelOptionsProvider: Provider<AgentRuntimeSummaryModelAdapterOptions> =
  {
    provide: SUMMARY_AGENT_RUNTIME_SUMMARY_MODEL_OPTIONS,
    useFactory: (client: GrpcAgentRuntimeClient) =>
      resolveAgentRuntimeSummaryModelOptions(process.env, client),
    inject: [GrpcAgentRuntimeClient],
  };

export const summaryAgentRuntimeReaderSummaryModelOptionsProvider: Provider<AgentRuntimeReaderSummaryModelAdapterOptions> =
  {
    provide: SUMMARY_AGENT_RUNTIME_READER_SUMMARY_MODEL_OPTIONS,
    useFactory: (client: AgentRuntimeClientPort) =>
      resolveAgentRuntimeReaderSummaryModelOptions(process.env, client),
    inject: [SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT],
  };

export const summaryAgentRuntimeReaderSummaryTopicLabelerOptionsProvider: Provider<AgentRuntimeReaderSummaryTopicLabelerOptions> =
  {
    provide: SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_OPTIONS,
    useFactory: (client: AgentRuntimeClientPort) =>
      resolveAgentRuntimeReaderSummaryTopicLabelerOptions(process.env, client),
    inject: [SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT],
  };

export const summaryAgentRuntimeReaderSummaryPresentationOptionsProvider: Provider<AgentRuntimePromotionPresentationV3BuilderOptions> =
  {
    provide: SUMMARY_AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_OPTIONS,
    useFactory: (client: AgentRuntimeClientPort) =>
      resolveAgentRuntimePromotionPresentationV3BuilderOptions(process.env, client),
    inject: [SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT],
  };

export const summaryAgentRuntimeReaderSummaryTopicRelationVerifierOptionsProvider: Provider<AgentRuntimeReaderSummaryTopicRelationVerifierOptions> =
  {
    provide:
      SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_OPTIONS,
    useFactory: (client: AgentRuntimeClientPort) =>
      resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions(
        process.env,
        client,
      ),
    inject: [SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT],
  };

export const summaryAgentRuntimeReaderSummaryStoryRelationVerifierOptionsProvider: Provider<AgentRuntimeReaderSummaryStoryRelationVerifierOptions> =
  {
    provide:
      SUMMARY_AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_OPTIONS,
    useFactory: (client: AgentRuntimeClientPort) =>
      resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions(
        process.env,
        client,
      ),
    inject: [SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT],
  };

/**
 * Transport of reader-summary model tasks. Both are durable: the CLI runtime
 * behind gRPC (default) and the account-gateway llm entry.
 */
export const resolveReaderSummaryAgentRuntimeTransport = (
  env: NodeJS.ProcessEnv,
): ReaderSummaryAgentRuntimeTransport => {
  const value = env.AGENT_RUNTIME_TRANSPORT?.trim() || "agent-runtime";
  if (value !== "agent-runtime" && value !== "gateway-llm") {
    throw new Error('AGENT_RUNTIME_TRANSPORT must be "agent-runtime" or "gateway-llm"');
  }
  assertRuntimeProfileAllowsMode({
    env,
    settingName: "AGENT_RUNTIME_TRANSPORT",
    selectedMode: value,
    durableModes: ["agent-runtime", "gateway-llm"],
  });
  return value;
};

export const resolveSummaryAgentRuntimeClientOptions = (
  env: NodeJS.ProcessEnv,
  params: { readonly requireAddress: boolean },
): SummaryAgentRuntimeClientOptions => {
  const address = (env.AGENT_RUNTIME_GRPC_ADDRESS ?? "").trim();

  if (params.requireAddress && address.length === 0) {
    throw new Error(
      "Agent-runtime summary providers require AGENT_RUNTIME_GRPC_ADDRESS",
    );
  }

  return {
    address: address.length > 0 ? address : "127.0.0.1:0",
    timeoutMs: parsePositiveInteger(env.AGENT_RUNTIME_GRPC_TIMEOUT_MS, 5_000),
    serviceToken: nonEmptyOptional(env.AGENT_RUNTIME_SERVICE_TOKEN),
    defaultCwd: env.AGENT_RUNTIME_TASK_CWD === undefined
      ? undefined
      : validateAgentRuntimeDefaultCwd(env.AGENT_RUNTIME_TASK_CWD),
  };
};

const nonEmptyOptional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
