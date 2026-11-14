import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { MemoStackSummaryMemoryAdapter } from "@social-monitor/summary/adapters/memory/memo-stack-summary-memory.adapter";
import { optionalString, readString, type JsonRecord } from "./durable-backend-e2e-json-fields";

export function summaryMemoryContextQuery(params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly interestId: string;
  readonly feedItems: readonly JsonRecord[];
}): Parameters<MemoStackSummaryMemoryAdapter["buildContext"]>[0] {
  const requestedAt = new Date();
  const evidenceItems = params.feedItems.slice(0, 12).map((item, index) => {
    const providerKey = readString(item, "providerKey");
    const feedItemId = readString(item, "id");
    const bodyPreview = optionalString(item, "bodyPreview");
    const canonicalUrl = optionalString(item, "canonicalUrl");

    return {
      feedItemId,
      sourceItemId:
        optionalString(item, "sourceItemId") ??
        `source-${providerKey}-${index}`,
      sourceBindingId: readString(item, "sourceBindingId"),
      providerKey,
      title:
        optionalString(item, "title") ??
        `${providerKey} feed item ${index + 1}`,
      ...(bodyPreview === undefined ? {} : { bodyPreview }),
      ...(canonicalUrl === undefined ? {} : { canonicalUrl }),
      observedAt: parseDateOrFallback(
        optionalString(item, "observedAt"),
        requestedAt,
      ),
    };
  });

  return {
    tenantId: tenantId(params.tenantId),
    workspaceId: workspaceId(params.workspaceId),
    interestId: params.interestId,
    userId: params.userId,
    requestedAt,
    evidence: {
      sourceWindow: {
        windowId: `durable-backend-loop-memory-${params.interestId}`,
        startedAt: requestedAt,
        endedAt: requestedAt,
        selectedFeedItemIds: evidenceItems.map((item) => item.feedItemId),
      },
      items: evidenceItems,
    },
  };
}

function parseDateOrFallback(value: string | undefined, fallback: Date): Date {
  if (value === undefined) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
