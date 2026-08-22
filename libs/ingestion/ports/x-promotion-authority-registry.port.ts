export const X_PROMOTION_AUTHORITY_REGISTRY_VERSION =
  "x_promotion_authority_registry.v1" as const;

export type VerifiedXPromotionAuthorityIdentity = {
  readonly provider: "x";
  readonly canonicalHandle: string;
  readonly registryVersion: typeof X_PROMOTION_AUTHORITY_REGISTRY_VERSION;
  readonly verification: "verified";
};

export interface XPromotionAuthorityRegistryPort {
  resolveVerifiedIdentity(
    handle: string,
  ): VerifiedXPromotionAuthorityIdentity | null;
}
