import { buildGitHubTrendingPostgresCandidates } from "./github-trending-durable-snapshot-reuse-postgres-fixture";
import type { GitHubTrendingDurableSnapshotCandidate } from "./github-trending-durable-snapshot-reuse";

// Distinct complete generations on the fixture's closed day, oldest first.
export const buildGitHubTrendingCapacityGenerations = (
  count: number,
): GitHubTrendingDurableSnapshotCandidate[] => {
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error("capacity fixture requires 1..20 generations");
  }
  return Array.from({ length: count }, (_, hour) => {
    const prefix = `2026-07-23T${String(hour).padStart(2, "0")}`;
    return buildGitHubTrendingPostgresCandidates({
      groupKey: `capacity-${hour}`,
      fetchStartedAt: `${prefix}:00:00.000Z`,
      checkedAt: `${prefix}:01:00.000Z`,
      observedAt: `${prefix}:01:01.000Z`,
    });
  }).flat();
};
