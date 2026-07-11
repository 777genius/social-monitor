import type { Provider } from "@nestjs/common";
import { SystemClock } from "@social-monitor/shared-kernel";

import {
  AgentRuntimeReaderSummaryModelAdapter,
  type AgentRuntimeReaderSummaryModelAdapterOptions,
} from "../../adapters/model/agent-runtime-reader-summary-model.adapter";
import {
  AgentRuntimeReaderSummaryTopicLabeler,
  type AgentRuntimeReaderSummaryTopicLabelerOptions,
} from "../../adapters/model/agent-runtime-reader-summary-topic-labeler.adapter";
import {
  AgentRuntimeReaderSummaryTopicRelationVerifier,
  type AgentRuntimeReaderSummaryTopicRelationVerifierOptions,
} from "../../adapters/model/agent-runtime-reader-summary-topic-relation-verifier.adapter";
import {
  AgentRuntimeReaderSummaryStoryRelationVerifier,
  type AgentRuntimeReaderSummaryStoryRelationVerifierOptions,
} from "../../adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter";
import {
  AgentRuntimeSummaryModelAdapter,
  type AgentRuntimeSummaryModelAdapterOptions,
} from "../../adapters/model/agent-runtime-summary-model.adapter";
import { GrpcAgentRuntimeClient } from "../../adapters/model/grpc-agent-runtime-client";
import {
  SUMMARY_AGENT_RUNTIME_CLIENT_OPTIONS,
  SUMMARY_AGENT_RUNTIME_READER_SUMMARY_MODEL_OPTIONS,
  SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_OPTIONS,
  SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_OPTIONS,
  SUMMARY_AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_OPTIONS,
  SUMMARY_AGENT_RUNTIME_SUMMARY_MODEL_OPTIONS,
  type SummaryAgentRuntimeClientOptions,
} from "./summary-agent-runtime-provider-tokens";

export const summaryAgentRuntimeProviders: readonly Provider[] = [
  {
    provide: GrpcAgentRuntimeClient,
    useFactory: (
      options: SummaryAgentRuntimeClientOptions,
    ): GrpcAgentRuntimeClient =>
      GrpcAgentRuntimeClient.connect({
        address: options.address,
        clock: new SystemClock(),
        options: {
          timeoutMs: options.timeoutMs,
          serviceToken: options.serviceToken,
        },
      }),
    inject: [SUMMARY_AGENT_RUNTIME_CLIENT_OPTIONS],
  },
  {
    provide: AgentRuntimeSummaryModelAdapter,
    useFactory: (options: AgentRuntimeSummaryModelAdapterOptions) =>
      new AgentRuntimeSummaryModelAdapter(options),
    inject: [SUMMARY_AGENT_RUNTIME_SUMMARY_MODEL_OPTIONS],
  },
  {
    provide: AgentRuntimeReaderSummaryModelAdapter,
    useFactory: (options: AgentRuntimeReaderSummaryModelAdapterOptions) =>
      new AgentRuntimeReaderSummaryModelAdapter(options),
    inject: [SUMMARY_AGENT_RUNTIME_READER_SUMMARY_MODEL_OPTIONS],
  },
  {
    provide: AgentRuntimeReaderSummaryTopicLabeler,
    useFactory: (options: AgentRuntimeReaderSummaryTopicLabelerOptions) =>
      new AgentRuntimeReaderSummaryTopicLabeler(options),
    inject: [SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_OPTIONS],
  },
  {
    provide: AgentRuntimeReaderSummaryStoryRelationVerifier,
    useFactory: (
      options: AgentRuntimeReaderSummaryStoryRelationVerifierOptions,
    ) => new AgentRuntimeReaderSummaryStoryRelationVerifier(options),
    inject: [
      SUMMARY_AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_OPTIONS,
    ],
  },
  {
    provide: AgentRuntimeReaderSummaryTopicRelationVerifier,
    useFactory: (
      options: AgentRuntimeReaderSummaryTopicRelationVerifierOptions,
    ) => new AgentRuntimeReaderSummaryTopicRelationVerifier(options),
    inject: [
      SUMMARY_AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_OPTIONS,
    ],
  },
];
