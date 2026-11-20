// Closed weekly legacy claim types and exact story-derived provenance.
// Citation chronology remains a separate evidence policy.
export const exactLegacyClaimType = (value: unknown, label: string): string => {
  if (value !== "snapshot" && value !== "evolution" && value !== "resolution") {
    throw new Error(`${label} claim type is invalid`);
  }
  return value;
};

export const legacyClaimTypeFromStories = (
  stories: unknown,
  storyId: unknown,
  label: string,
): string => {
  if (!Array.isArray(stories)) {
    throw new Error(`${label} must inherit its claim type from a story`);
  }
  const matches = stories.filter(
    (story) =>
      story !== null &&
      typeof story === "object" &&
      (story as Record<string, unknown>).storyId === storyId,
  );
  if (matches.length !== 1) {
    throw new Error(
      `${label} must inherit its claim type from exactly one story`,
    );
  }
  return exactLegacyClaimType(
    (matches[0] as Record<string, unknown>).claimType,
    label,
  );
};
