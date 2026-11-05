import type { FeedItem } from "@social-monitor/feed/domain";
import { DomainError, err, ok, type Result } from "@social-monitor/shared-kernel";
import type { ConfiguredInterest, ConfiguredInterestReaderPort } from "../../ports";
import type { RankFeedItemsCommand } from "./rank-feed-items.command";

export async function resolvePromotionInterests(
  command: RankFeedItemsCommand,
  items: readonly FeedItem[],
  reader: ConfiguredInterestReaderPort | undefined,
): Promise<Result<ReadonlyMap<string, ConfiguredInterest>, DomainError>> {
  const conflict = (reason: string) => err(new DomainError(
    "operation.conflict", "Configured interest authority could not be resolved", { reason },
  ));
  if (reader === undefined) return conflict("configured_interest_reader_unavailable");
  const resolved = new Map<string, ConfiguredInterest>();
  for (const item of items) {
    const scope = item.toSnapshot();
    if (scope.tenantId !== command.tenantId || scope.workspaceId !== command.workspaceId ||
        !scope.sourceBindingId.trim() || !scope.providerKey.trim() ||
        !scope.interestId.trim() || (command.interestId?.trim() &&
        scope.interestId !== command.interestId.trim())) return conflict("configured_interest_scope_mismatch");
    if (resolved.has(scope.interestId)) continue;
    try {
      const result = await reader.readCurrent({ tenantId: command.tenantId,
        workspaceId: command.workspaceId, interestId: scope.interestId });
      if (result.kind !== "available") return conflict(`configured_interest_${result.kind}`);
      const value = result.interest;
      if (value.tenantId !== command.tenantId || value.workspaceId !== command.workspaceId ||
          value.interestId !== scope.interestId || !value.query.trim()) {
        return conflict("configured_interest_scope_mismatch");
      }
      resolved.set(scope.interestId, Object.freeze({ ...value }));
    } catch {
      return conflict("configured_interest_unavailable");
    }
  }
  return ok(resolved);
}
