export type SourceProviderKey = string;

export type SourceContentUnit =
  | "post"
  | "comment"
  | "profile"
  | "community"
  | "media"
  | "link";
export type SourceQueryMode =
  | "search"
  | "listing"
  | "account_feed"
  | "thread"
  | "url";
export type SourceCursorModel =
  | "none"
  | "time"
  | "page_token"
  | "opaque"
  | "since_id"
  | "etag_last_modified";
export type SourceQuotaModel =
  | "none"
  | "per_app"
  | "per_credential"
  | "per_tenant"
  | "per_source_binding";
export type ProviderFailureKind =
  | "rate_limited"
  | "auth_failed"
  | "unavailable"
  | "invalid_query"
  | "unknown";

export type SourceCapabilityProfile = {
  readonly providerKey: SourceProviderKey;
  readonly displayName: string;
  readonly version: number;
  readonly productionSafe: boolean;
  readonly supportedContentUnits: readonly SourceContentUnit[];
  readonly supportedQueryModes: readonly SourceQueryMode[];
  readonly cursorModel: SourceCursorModel;
  readonly stableIdentity: readonly string[];
  readonly quotaModel: SourceQuotaModel;
  readonly limitations: readonly string[];
};

export const sourceProviderKey = (value: string): SourceProviderKey => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("Source provider key must be non-empty");
  }

  return normalized;
};

export const createSourceProviderProfile = (
  profile: SourceCapabilityProfile,
): SourceCapabilityProfile => {
  if (profile.displayName.trim().length === 0) {
    throw new Error("Source provider display name must be non-empty");
  }
  if (!Number.isInteger(profile.version) || profile.version <= 0) {
    throw new Error("Source provider version must be a positive integer");
  }
  if (profile.supportedContentUnits.length === 0) {
    throw new Error("Source provider must declare supported content units");
  }
  if (profile.supportedQueryModes.length === 0) {
    throw new Error("Source provider must declare supported query modes");
  }
  if (profile.stableIdentity.length === 0) {
    throw new Error("Source provider must declare stable identity fields");
  }

  return {
    ...profile,
    providerKey: sourceProviderKey(profile.providerKey),
  };
};
