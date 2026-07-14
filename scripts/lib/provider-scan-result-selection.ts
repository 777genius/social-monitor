import { providerMeetsProductionBlockingPolicy } from "./production-collection-quality-policy";

type ProviderScanSelectionCandidate = Parameters<
  typeof providerMeetsProductionBlockingPolicy
>[0];

export function selectPreferredProviderScanResult<
  TResult extends ProviderScanSelectionCandidate,
>(current: TResult, candidate: TResult): TResult {
  const currentMeetsPolicy = providerMeetsProductionBlockingPolicy(current);
  const candidateMeetsPolicy = providerMeetsProductionBlockingPolicy(candidate);
  if (currentMeetsPolicy !== candidateMeetsPolicy) {
    return candidateMeetsPolicy ? candidate : current;
  }

  const currentAccepted = current.observability.slo.evaluatedItemCount;
  const candidateAccepted = candidate.observability.slo.evaluatedItemCount;
  if (currentAccepted !== candidateAccepted) {
    return candidateAccepted > currentAccepted ? candidate : current;
  }

  const currentRateLimits = current.observability.rateLimitEventCount;
  const candidateRateLimits = candidate.observability.rateLimitEventCount;
  if (currentRateLimits !== candidateRateLimits) {
    return candidateRateLimits < currentRateLimits ? candidate : current;
  }

  return candidate;
}
