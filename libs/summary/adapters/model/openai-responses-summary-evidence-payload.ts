import type { SummaryModelInput } from '../../ports';
import {
  repositorySignalPromptBlock,
  repositoryTrendPromptBlock,
} from './openai-responses-summary-repository-evidence';

/** Untrusted evidence and memory projection only; system instructions are separate. */
export const buildPromptPayload = (input: SummaryModelInput): string =>
  JSON.stringify({
    interestId: input.interestId,
    requestedAt: input.requestedAt.toISOString(),
    policy: input.policy,
    sourceWindow: {
      windowId: input.evidence.sourceWindow.windowId,
      startedAt: input.evidence.sourceWindow.startedAt.toISOString(),
      endedAt: input.evidence.sourceWindow.endedAt.toISOString(),
    },
    memoryContext:
      input.memoryContext === undefined
        ? undefined
        : {
            status: input.memoryContext.status,
            renderedText: input.memoryContext.renderedText,
            sourceRefs: input.memoryContext.sourceRefs,
            retrieval: input.memoryContext.retrieval,
            staleMarkers: input.memoryContext.staleMarkers,
            support: input.memoryContext.support,
            diagnostics: input.memoryContext.diagnostics,
            retrievedAt: input.memoryContext.retrievedAt.toISOString(),
          },
    evidence: input.evidence.items.map((item, index) => ({
      index: index + 1,
      citationId: `c${index + 1}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      sourceBindingId: item.sourceBindingId,
      providerKey: item.providerKey,
      title: item.title,
      bodyPreview: item.bodyPreview,
      canonicalUrl: item.canonicalUrl,
      observedAt: item.observedAt.toISOString(),
      extractedSummaries: item.extractedSummaries,
      conversationContext: item.conversationContext,
      providerMetadata: item.providerMetadata,
      repositoryTrend: repositoryTrendPromptBlock(item.providerMetadata),
      repositorySignal: repositorySignalPromptBlock(item.providerMetadata),
      relevance: item.relevance,
      safety: item.safety,
    })),
  });
