import { exactRetainedPromotionTimestamp } from "@social-monitor/feed/domain/value-objects/retained-promotion-authority";
import type { RetainedPromotionAuthority, RetainedPromotionCandidateAuthority } from
  "@social-monitor/feed/domain/value-objects/retained-promotion-authority";
import type { PromotionFeedItemCandidate } from "@social-monitor/feed/ports";

export const bindRetainedPromotionCandidateAuthority = (
  authority: RetainedPromotionAuthority,
  candidate: PromotionFeedItemCandidate,
): RetainedPromotionCandidateAuthority => {
  const bindings = authority.bindings.filter((binding) =>
    binding.feedItemId === candidate.item.toSnapshot().id);
  const binding = bindings.length === 1 ? bindings[0] : undefined;
  const matches = binding !== undefined && candidate.retainedAuthoritySha256 !== undefined &&
    binding.authoritySha256 === candidate.retainedAuthoritySha256 &&
    binding.cutoffAt !== null && candidate.retainedAuthorityObservedAt ===
      exactRetainedPromotionTimestamp(binding.cutoffAt);
  // An explicit invalid value keeps missing/mismatched historical authority closed
  // through both assessment and final admission, without a live-mode fallback.
  return { mode: authority.mode, projection: authority.projection,
    boundThrough: authority.boundThrough,
    authoritySha256: matches ? binding.authoritySha256 : "",
    cutoffAt: matches ? binding.cutoffAt ?? "" : "" };
};
