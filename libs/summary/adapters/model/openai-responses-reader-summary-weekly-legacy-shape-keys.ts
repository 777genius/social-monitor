// Legacy and expanded-legacy envelope/story/section exact-key allowlists.
// Keep the exact frozen wire vocabulary and property order; no schema changes.
export const legacyOutputKeys = [
  "schemaVersion",
  "sealId",
  "sealSha",
  "weekStartedOn",
  "weekEndedOn",
  "observedFrom",
  "observedThrough",
  "headline",
  "takeaway",
  "synthesis",
  "citationIds",
  "sections",
] as const;
export const expandedLegacyOutputKeys = [
  "schemaVersion", "sealId", "sealSha", "weekStartedOn", "weekEndedOn",
  "headline", "takeaway", "synthesis", "claimType", "citationIds",
  "observedFrom", "observedThrough", "stories", "sections",
] as const;
export const expandedLegacyStoryKeys = [
  "storyId", "headline", "synthesis", "status", "claimType",
  "citationIds", "observedFrom", "observedThrough",
] as const;
export const expandedLegacySectionKeys = [
  "sectionId", "kind", "storyId", "headline", "synthesis", "claimType",
  "citationIds", "observedFrom", "observedThrough",
] as const;
export const expandedLegacySectionKeysWithoutClaimType = [
  "sectionId", "kind", "storyId", "headline", "synthesis",
  "citationIds", "observedFrom", "observedThrough",
] as const;
export const legacySectionKeys = [
  "sectionId",
  "kind",
  "storyId",
  "claimType",
  "status",
  "observedFrom",
  "observedThrough",
  "headline",
  "takeaway",
  "synthesis",
  "citationIds",
] as const;
export const legacySectionKeysWithoutTakeaway = [
  "sectionId",
  "kind",
  "storyId",
  "claimType",
  "status",
  "observedFrom",
  "observedThrough",
  "headline",
  "synthesis",
  "citationIds",
] as const;
