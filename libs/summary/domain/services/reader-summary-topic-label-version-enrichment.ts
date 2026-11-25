import {
  compactLabel,
  normalizeTopicLabel,
} from "./reader-summary-topic-map-text";

export const enrichReaderSummaryTopicLabelVersion = (params: {
  readonly label: string;
  readonly candidateLabels: readonly string[];
}): string => {
  const label = compactLabel(params.label);
  if (/\d/u.test(label)) {
    return label;
  }
  const roots = dominantVersionRoots(params.candidateLabels);
  for (const root of roots) {
    const basePattern = new RegExp(`\\b${escapeRegExp(root.base)}\\b`, "iu");
    if (!basePattern.test(label)) {
      continue;
    }

    return label.replace(
      basePattern,
      (base) => `${base}${root.separator}${root.major}`,
    );
  }

  return label;
};

type VersionRoot = {
  readonly base: string;
  readonly major: string;
  readonly separator: "-" | " ";
  readonly support: number;
  readonly firstSeen: number;
};

const dominantVersionRoots = (
  candidateLabels: readonly string[],
): readonly VersionRoot[] => {
  const roots = new Map<string, VersionRoot>();
  candidateLabels.forEach((candidate, candidateIndex) => {
    const seenInCandidate = new Set<string>();
    for (const match of candidate.matchAll(versionedEntityPattern())) {
      const base = match[1];
      const separator = match[2];
      const major = match[3];
      if (
        base === undefined ||
        separator === undefined ||
        major === undefined
      ) {
        continue;
      }
      const key = `${normalizeTopicLabel(base)}\u0000${major}`;
      if (seenInCandidate.has(key)) {
        continue;
      }
      seenInCandidate.add(key);
      const current = roots.get(key);
      roots.set(key, {
        base: current?.base ?? base,
        major,
        separator: current?.separator === "-" || separator === "-" ? "-" : " ",
        support: (current?.support ?? 0) + 1,
        firstSeen: Math.min(
          current?.firstSeen ?? candidateIndex,
          candidateIndex,
        ),
      });
    }
  });
  const rootsByBase = new Map<string, VersionRoot[]>();
  for (const root of roots.values()) {
    const base = normalizeTopicLabel(root.base);
    rootsByBase.set(base, [...(rootsByBase.get(base) ?? []), root]);
  }

  return [...rootsByBase.values()]
    .flatMap((sameBaseRoots) => {
      const ranked = sameBaseRoots.slice().sort(compareRoots);
      const lead = ranked[0];
      const runnerUp = ranked[1];

      return lead !== undefined &&
        (runnerUp === undefined || lead.support > runnerUp.support)
        ? [lead]
        : [];
    })
    .sort(compareRoots);
};

const versionedEntityPattern = (): RegExp =>
  /\b([\p{Letter}][\p{Letter}\p{Number}]{1,31})([- ])(\d{1,4})(?:[.-]\d+)*\b/gu;

const compareRoots = (left: VersionRoot, right: VersionRoot): number =>
  right.support - left.support ||
  left.firstSeen - right.firstSeen ||
  left.base.localeCompare(right.base);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
