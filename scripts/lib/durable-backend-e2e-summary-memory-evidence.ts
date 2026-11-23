import type { SummaryMemoryContext } from "@social-monitor/summary/ports";

export type SummaryMemoryEvidence = {
  readonly status: "available";
  readonly memoryBaseUrlOrigin: string;
  readonly topicScopeExternalRef: string;
  readonly providerScopeExternalRef: string;
  readonly sourceRefTypes: readonly string[];
  readonly sourceRefCount: number;
  readonly renderedTextChars: number;
  readonly factsUsed?: number | undefined;
  readonly itemsUsed?: number | undefined;
  readonly retrievalSourcesUsed?: readonly string[] | undefined;
  readonly memoryEffectMatched: boolean;
};

export function summaryMemoryEvidenceSnapshot(
  params: {
    readonly interestId: string;
    readonly feedbackId: string;
    readonly feedbackProviderKey: string;
  },
  context: SummaryMemoryContext,
  config: { readonly memoryBaseUrl: string },
): SummaryMemoryEvidence | undefined {
  if (context.status !== "available") {
    return undefined;
  }

  const sourceRefs = context.sourceRefs ?? [];
  const sourceRefTypes = [
    ...new Set(
      sourceRefs
        .map((ref) =>
          typeof ref.source_type === "string" ? ref.source_type : undefined,
        )
        .filter(
          (value): value is string =>
            value !== undefined && value.trim().length > 0,
        ),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const renderedText = context.renderedText ?? "";
  const rendered = renderedText.toLocaleLowerCase("en-US");
  const matchedBySourceRef = sourceRefs.some(
    (ref) =>
      ref.source_type === "social-monitor.summary-feedback" &&
      ref.source_id === params.feedbackId,
  );
  const matchedByText =
    rendered.includes(
      `summary feedback for topic ${params.interestId}`.toLocaleLowerCase("en-US"),
    ) ||
    rendered.includes(
      `provider ${params.feedbackProviderKey}`.toLocaleLowerCase("en-US"),
    );
  const matchedByDiagnostics =
    Number(
      context.retrieval?.factsUsed ?? context.diagnostics.facts_used ?? 0,
    ) > 0 ||
    Number(
      context.retrieval?.itemsUsed ?? context.diagnostics.items_used ?? 0,
    ) > 0;
  const memoryEffectMatched =
    matchedBySourceRef || matchedByText || matchedByDiagnostics;
  if (!memoryEffectMatched) {
    return undefined;
  }

  return {
    status: "available",
    memoryBaseUrlOrigin: safeUrlOrigin(config.memoryBaseUrl),
    topicScopeExternalRef: `interest:${params.interestId}:feedback`,
    providerScopeExternalRef: `interest:${params.interestId}:provider:${params.feedbackProviderKey}:quality`,
    sourceRefTypes,
    sourceRefCount: sourceRefs.length,
    renderedTextChars: renderedText.length,
    factsUsed: numberOrUndefined(
      context.retrieval?.factsUsed ?? context.diagnostics.facts_used,
    ),
    itemsUsed: numberOrUndefined(
      context.retrieval?.itemsUsed ?? context.diagnostics.items_used,
    ),
    retrievalSourcesUsed: stringArrayOrUndefined(
      context.retrieval?.retrievalSourcesUsed ??
        context.diagnostics.retrieval_sources_used,
    ),
    memoryEffectMatched,
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringArrayOrUndefined(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

export function safeMemoryContextDebug(
  context: SummaryMemoryContext | undefined,
): string {
  if (context === undefined) {
    return "{}";
  }

  return JSON.stringify({
    status: context.status,
    sourceRefTypes: [
      ...new Set(
        (context.sourceRefs ?? [])
          .map((ref) =>
            typeof ref.source_type === "string" ? ref.source_type : undefined,
          )
          .filter((value): value is string => value !== undefined),
      ),
    ],
    factsUsed: context.retrieval?.factsUsed ?? context.diagnostics.facts_used,
    itemsUsed: context.retrieval?.itemsUsed ?? context.diagnostics.items_used,
    renderedTextChars: context.renderedText?.length ?? 0,
  });
}

function safeUrlOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "invalid-url-redacted";
  }
}
