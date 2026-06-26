import type {
  SummaryMemoryContext,
  SummaryMemoryRetrieval,
  SummaryMemorySourceRef,
  SummaryMemoryStaleMarkers,
  SummaryMemorySupport,
} from '../../ports';

export const mergeFallbackContexts = (
  contexts: readonly SummaryMemoryContext[],
  retrievedAt: Date,
): SummaryMemoryContext => {
  const renderedText = [...new Set(contexts
    .map((context) => context.renderedText?.trim())
    .filter((text): text is string => text !== undefined && text.length > 0))]
    .join('\n');
  const sourceRefs = mergeSourceRefs(contexts);

  return {
    status: renderedText.length === 0 ? 'empty' : 'available',
    renderedText: renderedText.length === 0 ? undefined : renderedText,
    sourceRefs: sourceRefs.length === 0 ? undefined : sourceRefs,
    retrieval: mergeRetrieval(contexts),
    staleMarkers: mergeStaleMarkers(contexts),
    support: mergeSupport(contexts),
    diagnostics: {
      fallbackFromScopeNotFound: true,
      fallbackScopesUsed: contexts.length,
    },
    retrievedAt,
  };
};

const mergeSourceRefs = (contexts: readonly SummaryMemoryContext[]): readonly SummaryMemorySourceRef[] => {
  const refs = new Map<string, SummaryMemorySourceRef>();
  for (const context of contexts) {
    for (const ref of context.sourceRefs ?? []) {
      const sourceType = typeof ref.source_type === 'string' ? ref.source_type : 'unknown';
      const sourceId = typeof ref.source_id === 'string' ? ref.source_id : JSON.stringify(ref);
      refs.set(`${sourceType}:${sourceId}`, ref);
    }
  }

  return [...refs.values()];
};

const mergeRetrieval = (contexts: readonly SummaryMemoryContext[]): SummaryMemoryRetrieval | undefined => {
  const retrievals = contexts
    .map((context) => context.retrieval)
    .filter((retrieval): retrieval is SummaryMemoryRetrieval => retrieval !== undefined);

  if (retrievals.length === 0) {
    return undefined;
  }

  return emptyObjectAsUndefined(withoutUndefined({
    vectorStatus: mergeStatus(retrievals.map((retrieval) => retrieval.vectorStatus)),
    graphStatus: mergeStatus(retrievals.map((retrieval) => retrieval.graphStatus)),
    ragStatus: mergeStatus(retrievals.map((retrieval) => retrieval.ragStatus)),
    retrievalSourcesUsed: uniqueStrings(retrievals.flatMap((retrieval) => retrieval.retrievalSourcesUsed ?? [])),
    retrievalSourcesTotal: sumNumbers(retrievals.map((retrieval) => retrieval.retrievalSourcesTotal)),
    retrievalSourcesReturned: sumNumbers(retrievals.map((retrieval) => retrieval.retrievalSourcesReturned)),
    itemsConsidered: sumNumbers(retrievals.map((retrieval) => retrieval.itemsConsidered)),
    itemsUsed: sumNumbers(retrievals.map((retrieval) => retrieval.itemsUsed)),
    factsConsidered: sumNumbers(retrievals.map((retrieval) => retrieval.factsConsidered)),
    factsUsed: sumNumbers(retrievals.map((retrieval) => retrieval.factsUsed)),
    sourceRefsTotal: sumNumbers(retrievals.map((retrieval) => retrieval.sourceRefsTotal)),
    sourceRefsReturned: sumNumbers(retrievals.map((retrieval) => retrieval.sourceRefsReturned)),
  })) as SummaryMemoryRetrieval | undefined;
};

const mergeStaleMarkers = (contexts: readonly SummaryMemoryContext[]): SummaryMemoryStaleMarkers | undefined => {
  const staleMarkers = contexts
    .map((context) => context.staleMarkers)
    .filter((markers): markers is SummaryMemoryStaleMarkers => markers !== undefined);

  if (staleMarkers.length === 0) {
    return undefined;
  }

  return emptyObjectAsUndefined(withoutUndefined({
    supersededFactsConsidered: sumNumbers(staleMarkers.map((markers) => markers.supersededFactsConsidered)),
    supersededFactsUsed: sumNumbers(staleMarkers.map((markers) => markers.supersededFactsUsed)),
    staleFactsConsidered: sumNumbers(staleMarkers.map((markers) => markers.staleFactsConsidered)),
    staleFactsUsed: sumNumbers(staleMarkers.map((markers) => markers.staleFactsUsed)),
    staleVectorDropCount: sumNumbers(staleMarkers.map((markers) => markers.staleVectorDropCount)),
    staleGraphDropCount: sumNumbers(staleMarkers.map((markers) => markers.staleGraphDropCount)),
    staleRagDropCount: sumNumbers(staleMarkers.map((markers) => markers.staleRagDropCount)),
  })) as SummaryMemoryStaleMarkers | undefined;
};

const mergeSupport = (contexts: readonly SummaryMemoryContext[]): SummaryMemorySupport | undefined => {
  const supports = contexts
    .map((context) => context.support)
    .filter((support): support is SummaryMemorySupport => support !== undefined);

  if (supports.length === 0) {
    return undefined;
  }

  return emptyObjectAsUndefined(withoutUndefined({
    status: mergeStatus(supports.map((support) => support.status)),
    itemsReturned: sumNumbers(supports.map((support) => support.itemsReturned)),
    warnings: uniqueStrings(supports.flatMap((support) => support.warnings ?? [])),
  })) as SummaryMemorySupport | undefined;
};

const mergeStatus = (values: readonly (string | undefined)[]): string | undefined => {
  const unique = uniqueStrings(values);

  return unique.length === 0 ? undefined : unique.join(',');
};

const uniqueStrings = (values: readonly (string | undefined)[]): readonly string[] => [
  ...new Set(values
    .map((value) => value?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0)),
];

const sumNumbers = (values: readonly (number | undefined)[]): number | undefined => {
  const present = values.filter((value): value is number => value !== undefined);

  return present.length === 0 ? undefined : present.reduce((total, value) => total + value, 0);
};

const withoutUndefined = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

const emptyObjectAsUndefined = (value: Record<string, unknown>): Record<string, unknown> | undefined =>
  Object.keys(value).length === 0 ? undefined : value;
