import type { SourceCapabilityProfile } from "../../../ports";

export const redditCapabilityProfile: SourceCapabilityProfile = {
  providerKey: "reddit",
  displayName: "Reddit",
  version: 1,
  productionSafe: true,
  supportedContentUnits: ["post", "comment", "community", "link"],
  supportedQueryModes: ["search", "listing"],
  cursorModel: "opaque",
  stableIdentity: ["providerId", "canonicalUrl"],
  quotaModel: "per_app",
  limitations: [
    "Uses Reddit OAuth API only. Uses app-only OAuth by default; encrypted tenant bearer or refresh-token credentials can override when needed.",
  ],
};
