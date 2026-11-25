import { CryptoIdGenerator, SystemClock, type Clock, type IdGenerator } from "@social-monitor/shared-kernel";
import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports";
import { createSourceAssessmentRuntime } from "@social-monitor/summary/interfaces/rest/source-assessment-runtime-provider-tokens";
import { AgentRuntimeSourceContentQualityReviewerAdapter } from "../../adapters/model/agent-runtime-source-content-quality-reviewer.adapter";
import { OpenAiSourceContentQualityReviewerAdapter } from "../../adapters/model/openai-source-content-quality-reviewer.adapter";
import { SOURCE_CONTENT_QUALITY_REVIEWER, NOOP_SOURCE_CONTENT_QUALITY_REVIEWER, type SourceContentQualityReviewerPort } from "../../ports";
import { resolveRelevanceContentQualityReviewerMode, resolveRelevanceContentQualityOpenAiOptions } from "./relevance-provider-tokens";

export const createSourceContentAssessmentReviewer = (input: {
  readonly env: NodeJS.ProcessEnv;
  readonly summaryModelMode?: string;
  readonly client?: AgentRuntimeClientPort;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
}): SourceContentQualityReviewerPort => {
  const mode = resolveRelevanceContentQualityReviewerMode(input.env, input.summaryModelMode);
  if (mode === "disabled") return NOOP_SOURCE_CONTENT_QUALITY_REVIEWER;
  if (mode === "openai-responses") return new OpenAiSourceContentQualityReviewerAdapter(
    resolveRelevanceContentQualityOpenAiOptions(input.env, { requireApiKey: true }));
  return new AgentRuntimeSourceContentQualityReviewerAdapter({
    ...createSourceAssessmentRuntime({ env: input.env, client: input.client,
      clock: input.clock ?? new SystemClock() }),
    ids: input.ids ?? new CryptoIdGenerator(),
    clock: input.clock ?? new SystemClock(),
  });
};

export const sourceContentAssessmentReviewerProvider = {
  provide: SOURCE_CONTENT_QUALITY_REVIEWER,
  useFactory: (): SourceContentQualityReviewerPort => createSourceContentAssessmentReviewer({ env: process.env }),
};
