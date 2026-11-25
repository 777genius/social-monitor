// Sealed compact envelope/story exact-key allowlists.
// Keep the exact frozen wire vocabulary and property order; no schema changes.
export const sealedCompactOutputKeys = [
  "schemaVersion", "sealId", "sealSha", "weekStartedOn", "weekEndedOn",
  "headline", "takeaway", "synthesis", "citationIds", "observedFrom",
  "observedThrough", "stories", "sections",
] as const;
export const sealedCompactStoryKeys = [
  "storyId", "status", "claimType", "observedFrom", "observedThrough",
  "synthesis", "citationIds",
] as const;
export const sealedCompactStoryKeysWithHeadline = [
  "storyId", "status", "claimType", "headline", "observedFrom",
  "observedThrough", "synthesis", "citationIds",
] as const;
