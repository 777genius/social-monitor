export function historicalGithubPolicyMatches(policy, manifest) {
  if (
    policy === null || typeof policy !== "object" ||
    manifest === null || typeof manifest !== "object" ||
    manifest.providerCounts === null ||
    typeof manifest.providerCounts !== "object" ||
    !Number.isInteger(policy.collectedRowCount) ||
    policy.collectedRowCount < 0
  ) return false;
  const count = manifest.providerCounts["github-trending-page"] ?? 0;
  if (policy.collectedRowCount !== count) return false;
  if (policy.mode === "verified_collected_rows") {
    return count > 0 && policy.reason === undefined;
  }
  return policy.mode === "historical_unavailable" && count === 0 &&
    typeof policy.reason === "string" && policy.reason.trim().length >= 20;
}
