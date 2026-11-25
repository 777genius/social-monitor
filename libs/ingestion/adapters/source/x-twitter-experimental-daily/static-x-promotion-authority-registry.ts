import {
  X_PROMOTION_AUTHORITY_REGISTRY_VERSION,
  type VerifiedXPromotionAuthorityIdentity,
  type XPromotionAuthorityRegistryPort,
} from "../../../ports";

export class StaticXPromotionAuthorityRegistry
  implements XPromotionAuthorityRegistryPort {
  private readonly handles: ReadonlySet<string>;

  constructor(handles: readonly string[]) {
    this.handles = new Set(handles.map(normalizeHandle));
  }

  resolveVerifiedIdentity(
    handle: string,
  ): VerifiedXPromotionAuthorityIdentity | null {
    const canonicalHandle = normalizeHandle(handle);
    if (!this.handles.has(canonicalHandle)) return null;
    return {
      provider: "x",
      canonicalHandle,
      registryVersion: X_PROMOTION_AUTHORITY_REGISTRY_VERSION,
      verification: "verified",
    };
  }
}

export class DenyAllXPromotionAuthorityRegistry
  implements XPromotionAuthorityRegistryPort {
  resolveVerifiedIdentity(): null {
    return null;
  }
}

const normalizeHandle = (value: string): string =>
  value.trim().replace(/^@/u, "").toLowerCase();
