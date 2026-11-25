import type { FeedItem } from "@social-monitor/feed/domain";
import type { JsonObject } from "@social-monitor/shared-kernel";
import type { ConfiguredInterest } from "../../ports";

export type PromotionTopicScope = Pick<ReturnType<FeedItem["toSnapshot"]>,
  "tenantId" | "workspaceId" | "interestId" | "sourceBindingId" | "providerKey">;

// The resolved value comes from the application read capability, never metadata.
// `query` uses the existing literal configured-query normalization contract.
export const trustedPromotionTopicContext = (
  scope: PromotionTopicScope | undefined,
  interest: ConfiguredInterest | undefined,
): JsonObject => {
  if (scope === undefined || interest === undefined ||
      !([scope.tenantId, scope.workspaceId, scope.interestId, scope.sourceBindingId, scope.providerKey]).every((value) => typeof value === "string" && value.trim()) ||
      scope.tenantId !== interest.tenantId || scope.workspaceId !== interest.workspaceId ||
      scope.interestId !== interest.interestId || !interest.query.trim()) return {};
  return { query: interest.query };
};
