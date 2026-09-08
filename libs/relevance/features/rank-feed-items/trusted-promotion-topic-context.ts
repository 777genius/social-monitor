import type { FeedItem } from "@social-monitor/feed/domain";
import type { JsonObject } from "@social-monitor/shared-kernel";

export type PromotionTopicScope = Pick<ReturnType<FeedItem["toSnapshot"]>,
  "tenantId" | "workspaceId" | "interestId" | "sourceBindingId" | "providerKey">;

// Stored application snapshots are usable only when bound to the hydrated row.
// Their own identity claims must never supply the scope used for validation.
export const trustedPromotionTopicContext = (
  metadata: JsonObject | undefined,
  scope: PromotionTopicScope | undefined,
): JsonObject => {
  if (scope === undefined || !Object.values({
    tenantId: scope.tenantId, workspaceId: scope.workspaceId,
    interestId: scope.interestId, sourceBindingId: scope.sourceBindingId,
    providerKey: scope.providerKey,
  }).every(nonemptyString)) return {};

  const interest = readObject(metadata?.interestQuerySnapshot);
  const binding = readObject(metadata?.sourceBindingSnapshot);
  const workspace = readObject(metadata?.workspaceScopeSnapshot);
  const sourceQuery = readObject(binding?.sourceQuery);
  if (interest?.interestId !== scope.interestId ||
      binding?.sourceBindingId !== scope.sourceBindingId ||
      binding?.providerKey !== scope.providerKey ||
      workspace?.tenantId !== scope.tenantId ||
      workspace?.workspaceId !== scope.workspaceId ||
      !nonemptyString(interest.query) ||
      !nonemptyString(sourceQuery?.query) ||
      !nonemptyString(sourceQuery?.mode) ||
      !["search", "listing", "account_feed", "thread", "url"].includes(sourceQuery.mode)) {
    return {};
  }

  // Only the existing query contract reaches quality and returned metadata.
  return {
    interestQuerySnapshot: { query: interest.query },
    sourceBindingSnapshot: {
      sourceQuery: { mode: sourceQuery.mode, query: sourceQuery.query },
    },
  };
};

const readObject = (value: unknown): JsonObject | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject : undefined;

const nonemptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
