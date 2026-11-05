import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import { exactUtcDay, githubProjectionItemTouchesDay, type ReaderSummaryPeriod } from "../../domain";
import type { ReaderSummaryGitHubProjectionReaderPort } from "../../ports";
import type { ReaderSummaryHistoricalGitHubOmission } from "./reader-summary-prepublication-gate";

export const missingGitHubProjectionOmissionReason =
  "No GitHub Trending projection was collected for this UTC day; the summary is published without the GitHub block.";

/**
 * A completed daily UTC day whose one eligible GitHub Trending binding has
 * no durable projection row at all (the collector never ran) is published
 * without the GitHub block instead of being rejected. It goes through the
 * existing historical omission: limited_sources on the summary and an
 * audited github_projection_unavailable_historical omission, which the gate
 * grants only after re-reading canonical zero itself.
 *
 * Any requested-day projection, however incomplete, mixed, stale or
 * malformed, keeps the strict Top 10 checks, and so do several eligible
 * bindings, an unreadable projection and a day that is not over yet.
 */
export const resolveMissingGitHubProjectionOmission = async (params: {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly period: ReaderSummaryPeriod;
  readonly githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
  readonly observedThrough: Date;
}): Promise<ReaderSummaryHistoricalGitHubOmission | undefined> => {
  const { period, observedThrough } = params;
  const observedDayStartedAt = Date.UTC(observedThrough.getUTCFullYear(),
    observedThrough.getUTCMonth(), observedThrough.getUTCDate());
  if (period.cadence !== "daily" ||
      exactUtcDay(period.startedAt, period.endedAt, period.timezone) === undefined ||
      !(period.endedAt.getTime() <= observedDayStartedAt)) {
    return undefined;
  }
  let durable: Awaited<ReturnType<ReaderSummaryGitHubProjectionReaderPort["read"]>>;
  try {
    durable = await params.githubProjectionReader.read({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      dayStartedAt: period.startedAt,
      dayEndedAt: period.endedAt,
      observedThrough,
    });
  } catch {
    return undefined;
  }
  const [bindingId, ...otherBindings] = durable.eligibleBindingIds;
  if (!Number.isSafeInteger(durable.pageCount) || durable.pageCount < 1 ||
      bindingId === undefined || bindingId.trim().length === 0 || otherBindings.length > 0 ||
      durable.items.some((item) => githubProjectionItemTouchesDay(item, period.startedAt, period.endedAt))) {
    return undefined;
  }
  return {
    reason: missingGitHubProjectionOmissionReason,
    authorizedAt: observedThrough,
    readerQuality: "limited_sources",
    expectedEligibleBindingId: bindingId,
  };
};

/**
 * The omission a run publishes under: the operator-configured historical
 * omission, else the one for a never-collected GitHub day. Canonical
 * recovery binds its own GitHub provenance and gets none.
 */
export const readerSummaryGitHubOmission = async (
  params: Parameters<typeof resolveMissingGitHubProjectionOmission>[0] & {
    readonly configured?: ReaderSummaryHistoricalGitHubOmission;
    readonly recoveryProvenanceActive: boolean;
  },
): Promise<ReaderSummaryHistoricalGitHubOmission | undefined> =>
  params.configured ?? (params.recoveryProvenanceActive
    ? undefined : resolveMissingGitHubProjectionOmission(params));
