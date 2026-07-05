import type { Provider } from "@nestjs/common";

import {
  resolveAgentRuntimeReaderSummaryModelOptions,
  type AgentRuntimeReaderSummaryModelAdapterOptions,
} from "../../adapters/model/agent-runtime-reader-summary-model.adapter";
import {
  resolveAgentRuntimeReaderSummaryTopicLabelerOptions,
  type AgentRuntimeReaderSummaryTopicLabelerOptions,
} from "../../adapters/model/agent-runtime-reader-summary-topic-labeler.adapter";
import {
  resolveAgentRuntimeSummaryModelOptions,
  type AgentRuntimeSummaryModelAdapterOptions,
} from "../../adapters/model/agent-runtime-summary-model.adapter";
import { GrpcAgentRuntimeClient } from "../../adapters/model/grpc-agent-runtime-client";
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
export const SUMMARY_AGENT_RUNTIME_SUMMARY_MODEL_OPTIONS = Symbol(
  "SUMMARY_AGENT_RUNTIME_SUMMARY_MODEL_OPTIONS",
);
export const SUMMARY_AGENT_RUNTIME_READER_SUMMARY_MODEL_OPTIONS = Symbol(
  "SUMMARY_AGENT_RUNTIME_READER_SUMMARY_MODEL_OPTIONS",
);
export const SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_OPTIONS =
  Symbol("SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_OPTIONS");

export type SummaryAgentRuntimeClientOptions = {
  readonly address: string;
  readonly timeoutMs: number;
  readonly serviceToken?: string;
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
        requireAddress:
          summaryMode === "agent-runtime" ||
          readerSummaryMode === "agent-runtime" ||
          topicLabelerMode === "agent-runtime",
      }),
    inject: [
      SUMMARY_MODEL_PROVIDER_MODE,
      READER_SUMMARY_MODEL_PROVIDER_MODE,
      READER_SUMMARY_TOPIC_LABELER_MODE,
    ],
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
    useFactory: (client: GrpcAgentRuntimeClient) =>
      resolveAgentRuntimeReaderSummaryModelOptions(process.env, client),
    inject: [GrpcAgentRuntimeClient],
  };

export const summaryAgentRuntimeReaderSummaryTopicLabelerOptionsProvider: Provider<AgentRuntimeReaderSummaryTopicLabelerOptions> =
  {
    provide: SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_OPTIONS,
    useFactory: (client: GrpcAgentRuntimeClient) =>
      resolveAgentRuntimeReaderSummaryTopicLabelerOptions(process.env, client),
    inject: [GrpcAgentRuntimeClient],
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
