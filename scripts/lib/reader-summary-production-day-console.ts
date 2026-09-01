import type { ProductionDayReport } from
  "./reader-summary-production-day-report";

export const printProductionDayStats = (report: ProductionDayReport): void => {
  console.log(
    [
      `production-day=${report.collectionDate}`,
      `collected=${report.stats.collectedFeedItemCount ?? "n/a"}`,
      `published=${report.stats.publishedInsideWindowFeedItemCount ?? "n/a"}`,
      `outside=${report.stats.observedButPublishedOutsideWindowFeedItemCount ?? "n/a"}`,
      `duplicates=${report.stats.duplicateFeedItemCount ?? "n/a"}`,
      `lowRelevance=${report.stats.lowRelevanceFeedItemCount ?? "n/a"}`,
      `candidates=${report.stats.summaryCandidateFeedItemCount ?? "n/a"}`,
      `selected=${report.stats.selectedFeedItemCount ?? "n/a"}`,
      `topReads=${report.stats.topReadCount ?? "n/a"}`,
      `xAccountsEligible=${report.stats.xAccountEligibleCount ?? "n/a"}/${report.stats.xAccountTotalCount ?? "n/a"}`,
      `xAccountEvents=${report.stats.xAccountUsageEventCount ?? "n/a"}`,
    ].join(" | "),
  );
  for (const account of report.stats.xAccounts ?? []) {
    console.log(
      [
        `xAccount=${account.accountFingerprint}`,
        `priority=${account.priorityRank}`,
        `prioritySource=${account.prioritySource}`,
        `eligible=${account.eligible ?? "n/a"}`,
        `ineligibleReasons=${account.ineligibilityReasonCodes?.join(",") || "none"}`,
        `requests=${account.dailyRequests}`,
        `tweets=${account.dailyTweets}`,
        `success=${account.passSucceededCount}`,
        `failed=${account.passFailedCount}`,
        `rateLimit=${account.rateLimitCount}`,
        `cooldown=${account.cooldownObservedCount}`,
        `lastUsed=${account.lastUsedAt ?? "n/a"}`,
        `cooldownUntil=${account.cooldownUntil ?? "n/a"}`,
      ].join(" | "),
    );
  }
};
