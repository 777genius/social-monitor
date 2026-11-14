import type { ReaderSummaryNarrativeSection } from "../../domain";

export const validSecondarySection = (
  storyClusterId: string | undefined,
  citationIds: readonly string[],
  planned: ReadonlyMap<string, ReadonlySet<string>>,
): boolean => {
  if (storyClusterId === undefined) {
    return false;
  }
  const allowed = planned.get(storyClusterId);

  return allowed !== undefined && citationIds.some((id) => allowed.has(id));
};

export const assertNarrativeCoverage = (
  sections: readonly ReaderSummaryNarrativeSection[],
  plannedSecondaryCitations: ReadonlyMap<string, ReadonlySet<string>>,
  diagnostics: string,
): void => {
  if (!sections.some((section) => section.kind === "lead")) {
    throw new Error(
      `Reader summary narrative must include a cited lead (${diagnostics})`,
    );
  }
  const secondarySections = sections.filter(
    (section) => section.kind === "secondary_signal",
  );
  const plannedClusterIds = [...plannedSecondaryCitations.keys()].slice(0, 3);
  const actualClusterIds = secondarySections
    .map((section) => section.storyClusterId)
    .filter((clusterId): clusterId is string => clusterId !== undefined);
  const missingClusterIds = plannedClusterIds.filter(
    (clusterId) => !actualClusterIds.includes(clusterId),
  );
  const duplicatedClusterIds = actualClusterIds.filter(
    (clusterId, index) => actualClusterIds.indexOf(clusterId) !== index,
  );
  if (missingClusterIds.length > 0 || duplicatedClusterIds.length > 0) {
    throw new Error(
      `Reader summary narrative does not exactly cover planned secondary signals (missing=${missingClusterIds.join(",") || "none"}, duplicated=${[...new Set(duplicatedClusterIds)].join(",") || "none"})`,
    );
  }
};
