import { normalizeTopicLabel } from "../../domain/services/reader-summary-topic-map-text";

/** Collision-safe group IDs, independent of source evidence and token admission. */
export const uniqueRecoveredGroupId = (
  label: string,
  existing: ReadonlySet<string>,
): string => {
  const base = `group:${normalizeTopicLabel(label)
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")}`;
  if (!existing.has(base)) {
    return base;
  }
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
};

