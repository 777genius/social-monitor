import { redactSensitiveText } from '@social-monitor/shared-kernel';

import type {
  BuildReaderSummaryContextQuery,
  ReaderSummaryContextProviderPort,
  SummaryMemoryContext,
  SummaryMemoryPort,
} from '../../ports';
import type { ReaderSummaryContextArtifact } from '../../domain';

const maxReaderSummaryMemoryTextLength = 1_800;

export class SummaryMemoryReaderSummaryContextProvider implements ReaderSummaryContextProviderPort {
  constructor(private readonly memory: SummaryMemoryPort) {}

  async buildContext(
    query: BuildReaderSummaryContextQuery,
  ): Promise<readonly ReaderSummaryContextArtifact[]> {
    const interestId = readerSummaryMemoryInterestId(query);
    const context = await this.memory.buildContext({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      interestId,
      userId: query.userId,
      subscriptionId: query.subscriptionId,
      evidence: {
        sourceWindow: query.evidence.sourceWindow,
        items: query.evidence.selectedEvidence.map((item) => ({
          feedItemId: item.feedItemId,
          sourceItemId: item.sourceItemId,
          sourceBindingId: item.sourceBindingId,
          providerKey: item.providerKey,
          title: item.title,
          bodyPreview: item.bodyPreview,
          canonicalUrl: item.canonicalUrl,
          observedAt: item.observedAt,
        })),
      },
      requestedAt: query.requestedAt,
    });
    const summaryText = memoryContextSummaryText(context);

    if (summaryText === undefined) {
      return [];
    }

    return [
      {
        artifactId: `summary-memory:${query.scope.type}:${interestId}`,
        scope: query.scope,
        period: query.period,
        summaryText,
        generatedAt: context.retrievedAt,
        freshness: memoryContextFreshness(context),
      },
    ];
  }
}

const readerSummaryMemoryInterestId = (query: BuildReaderSummaryContextQuery): string => {
  if (query.scope.type === 'interest') {
    return query.scope.interestId;
  }

  return query.evidence.selectedEvidence[0]?.interestId ?? 'workspace';
};

const memoryContextSummaryText = (context: SummaryMemoryContext): string | undefined => {
  if (context.status !== 'available' || context.renderedText === undefined) {
    return undefined;
  }

  const trimmed = redactSensitiveText(context.renderedText).trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const diagnostics = memoryContextDiagnosticsLine(context);
  const text = diagnostics === undefined ? trimmed : `${trimmed}\n${diagnostics}`;

  return text.length <= maxReaderSummaryMemoryTextLength
    ? text
    : `${text.slice(0, maxReaderSummaryMemoryTextLength - 15).trimEnd()} [truncated]`;
};

const memoryContextDiagnosticsLine = (context: SummaryMemoryContext): string | undefined => {
  const sourcesUsed = context.retrieval?.retrievalSourcesUsed?.join(', ');
  const factsUsed = context.retrieval?.factsUsed;
  const itemsUsed = context.retrieval?.itemsUsed;
  const parts = [
    sourcesUsed === undefined || sourcesUsed.length === 0 ? '' : `sources=${sourcesUsed}`,
    factsUsed === undefined ? '' : `facts_used=${factsUsed}`,
    itemsUsed === undefined ? '' : `items_used=${itemsUsed}`,
  ].filter((part) => part.length > 0);

  return parts.length === 0
    ? undefined
    : `Memory retrieval diagnostics: ${parts.join('; ')}`;
};

const memoryContextFreshness = (
  context: SummaryMemoryContext,
): ReaderSummaryContextArtifact['freshness'] => {
  const staleUsed = [
    context.staleMarkers?.staleFactsUsed,
    context.staleMarkers?.supersededFactsUsed,
    context.staleMarkers?.staleRagDropCount,
    context.staleMarkers?.staleGraphDropCount,
    context.staleMarkers?.staleVectorDropCount,
  ].some((value) => (value ?? 0) > 0);

  return staleUsed ? 'stale' : 'fresh';
};
