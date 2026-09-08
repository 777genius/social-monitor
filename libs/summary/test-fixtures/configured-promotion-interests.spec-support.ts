import type {
  ConfiguredInterest,
  ConfiguredInterestReaderPort,
} from "@social-monitor/relevance/ports";

// Test configuration is declared by each scenario, independently of feed rows
// and provider acquisition metadata. Unknown scopes fail closed.
export const configuredPromotionInterests = (
  interests: readonly ConfiguredInterest[],
): ConfiguredInterestReaderPort => ({
  async readCurrent(scope) {
    const interest = interests.find((candidate) =>
      candidate.tenantId === scope.tenantId &&
      candidate.workspaceId === scope.workspaceId &&
      candidate.interestId === scope.interestId,
    );
    return interest === undefined
      ? { kind: "missing" }
      : { kind: "available", interest };
  },
});
