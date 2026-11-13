import { createHash } from "node:crypto";
import { readerSummaryScopeKey } from "../../domain";
import type { ReaderSummaryStoryRelationVerifierInput } from "../../ports";
import { buildAgentRuntimeRequestId } from "./agent-runtime-model-support";
import { buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt } from "./agent-runtime-reader-summary-story-relation-verifier-prompt";

/** Owns lane-specific, tenant/workspace-scoped idempotency and correlation identity. */
export const buildAgentRuntimeStoryRelationIdentity = (
  input: ReaderSummaryStoryRelationVerifierInput,
) => {
    const scopeKey = readerSummaryScopeKey(input.scope);
    const requestScopeKey = input.verificationLane === "safe_recall_shadow"
      ? `${scopeKey}:safe-recall-shadow`
      : input.verificationLane === "related_topic"
        ? `${scopeKey}:related-topic`
        : input.verificationLane === "independent_news"
          ? `${scopeKey}:independent-news:${createHash("sha256")
            .update(buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt(input))
            .digest("hex").slice(0, 24)}`
          : scopeKey;
    const relatedTopicLane = input.verificationLane === "related_topic";
    return {
      relatedTopicLane,
      requestId: buildAgentRuntimeRequestId(
        relatedTopicLane
          ? "reader-summary-related-topic-relations"
          : "reader-summary-story-relations",
        input.tenantId,
        input.workspaceId,
        requestScopeKey,
        input.requestedAt,
      ),
      correlationId: buildAgentRuntimeRequestId(
        relatedTopicLane
          ? "reader-summary-related-topic-relations-correlation"
          : "reader-summary-story-relations-correlation",
        input.tenantId,
        input.workspaceId,
        requestScopeKey,
        input.requestedAt,
      ),
    } as const;
};
