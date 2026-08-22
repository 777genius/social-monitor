const topRequired = [
  "schemaVersion", "policyVersion", "digestVersion", "digest",
  "canonicalPayload", "artifactId", "sourceWindowId", "periodStartedAt",
  "periodEndedAt", "ingestionCutoff", "placement", "slot", "candidateId",
  "provider", "contentKind", "canonicalIdentity", "publishedAt",
  "observedAt", "citationId", "freshnessValid", "qualityScore",
  "relevanceScore", "integrityScore", "qualityValid", "safetyValid",
  "citationValid", "metricsState", "tier", "decision", "reason",
  "usefulnessComponents", "supportFacts", "citationIds", "providerCount",
  "confidence", "canonicalDedupeOutcome", "capOutcome",
] as const;
const topOptional = [
  "checkedAt", "metrics", "authorityAttestation", "relationTrace",
  "exactPublishedAt", "exactObservedAt", "exactPeriodStart",
  "exactPeriodEnd", "exactIngestionCutoff",
] as const;
const usefulnessKeys = [
  "normalizedStrength", "qualityScore", "interestRelevanceScore",
  "engagementIntegrityScore", "freshness", "total",
] as const;
const authorityKeys = ["status", "official", "trusted", "attestedBy"] as const;
const relationKeys = [
  "kind", "targetCanonicalIdentity", "confidence", "approved",
] as const;
const supportRequired = [
  "candidateId", "provider", "contentKind", "canonicalIdentity",
  "citationId", "publishedAt", "observedAt", "periodStart", "periodEnd",
  "ingestionCutoff", "freshnessValid", "qualityScore", "relevanceScore",
  "integrityScore", "qualityValid", "safetyValid", "citationValid",
  "metricsState", "metrics",
  "whyImportant",
] as const;
const supportOptional = [
  "checkedAt", "clusterId", "authorityAttestation", "relation",
  "exactPublishedAt", "exactObservedAt",
  "exactPeriodStart", "exactPeriodEnd", "exactIngestionCutoff",
] as const;

export const assertExactPromotionAttestationPayload = (value: unknown): void => {
  const items = requireArray(value, "promotion attestations");
  for (const [index, raw] of items.entries()) {
    const item = requireRecord(raw, `promotion attestation ${index}`);
    exactKeys(item, topRequired, topOptional, `promotion attestation ${index}`);
    strings(item, ["schemaVersion", "policyVersion", "digestVersion", "digest",
      "canonicalPayload", "artifactId", "sourceWindowId", "placement",
      "candidateId", "provider", "contentKind", "canonicalIdentity",
      "citationId", "metricsState", "tier", "decision", "reason",
      "canonicalDedupeOutcome", "capOutcome"]);
    optionalExactTimestamps(item);
    numbers(item, ["slot", "qualityScore", "relevanceScore", "integrityScore",
      "providerCount", "confidence"]);
    nonNegativeInteger(item.slot, "slot");
    nonNegativeInteger(item.providerCount, "providerCount");
    if ((item.providerCount as number) < 1) invalid("providerCount");
    units(item, ["qualityScore", "relevanceScore", "integrityScore", "confidence"]);
    booleans(item, ["freshnessValid", "qualityValid", "safetyValid", "citationValid"]);
    dates(item, ["periodStartedAt", "periodEndedAt", "ingestionCutoff",
      "publishedAt", "observedAt"], ["checkedAt"]);
    stringArray(item.citationIds, "promotion citationIds");
    assertUsefulness(item.usefulnessComponents);
    exactValue(item.schemaVersion, "reader_post_promotion_attestation.v1", "schemaVersion");
    exactValue(item.policyVersion, "reader_post_promotion.v1", "policyVersion");
    exactValue(item.digestVersion, "reader_post_promotion_digest.sha256.v1", "digestVersion");
    oneOf(item.placement, ["top", "additional"], "placement");
    exactValue(item.tier, item.placement, "tier");
    exactValue(item.decision,
      item.placement === "top" ? "promote_top" : "promote_additional",
      "decision");
    exactValue(item.canonicalDedupeOutcome, "retained", "canonicalDedupeOutcome");
    exactValue(item.capOutcome, "selected", "capOutcome");
    oneOf(item.metricsState, ["observed", "missing", "malformed", "conflict"], "metricsState");
    optionalAuthority(item.authorityAttestation);
    optionalRelation(item.relationTrace);
    if (item.metricsState === "observed" && item.metrics === undefined) {
      invalid("metrics");
    }
    if (item.metrics !== undefined) assertMetrics(item.metrics);
    for (const [supportIndex, supportRaw] of requireArray(
      item.supportFacts, "promotion supportFacts",
    ).entries()) {
      assertSupportFact(supportRaw, `${index}.${supportIndex}`);
    }
  }
};

const assertUsefulness = (value: unknown): void => {
  const record = requireRecord(value, "promotion usefulnessComponents");
  exactKeys(record, usefulnessKeys, [], "promotion usefulnessComponents");
  numbers(record, usefulnessKeys);
  for (const key of usefulnessKeys) {
    if ((record[key] as number) < 0 || (record[key] as number) > 1) invalid(key);
  }
};

const assertSupportFact = (value: unknown, path: string): void => {
  const item = requireRecord(value, `promotion support fact ${path}`);
  exactKeys(item, supportRequired, supportOptional, `promotion support fact ${path}`);
  strings(item, ["candidateId", "provider", "contentKind", "canonicalIdentity", "citationId"]);
  optionalExactTimestamps(item);
  numbers(item, ["qualityScore", "relevanceScore", "integrityScore"]);
  units(item, ["qualityScore", "relevanceScore", "integrityScore"]);
  booleans(item, ["freshnessValid", "qualityValid", "safetyValid", "citationValid"]);
  dates(item, ["publishedAt", "observedAt", "periodStart", "periodEnd", "ingestionCutoff"], ["checkedAt"]);
  optionalAuthority(item.authorityAttestation);
  optionalRelation(item.relation);
  exactValue(item.metricsState, "observed", "support.metricsState");
  if (item.metricsState === "observed" && item.metrics === undefined) {
    invalid("support.metrics");
  }
  if (item.metrics !== undefined) assertMetrics(item.metrics);
  if (typeof item.whyImportant !== "string" ||
      item.whyImportant.trim().length === 0) invalid("whyImportant");
  if (item.clusterId !== undefined &&
      (typeof item.clusterId !== "string" ||
        item.clusterId.trim().length === 0)) invalid("clusterId");
};

const optionalExactTimestamps = (value: Record<string, unknown>): void => {
  const pairs = [
    ["exactPublishedAt", "publishedAt"],
    ["exactObservedAt", "observedAt"],
    ["exactPeriodStart", "periodStartedAt" in value ? "periodStartedAt" : "periodStart"],
    ["exactPeriodEnd", "periodEndedAt" in value ? "periodEndedAt" : "periodEnd"],
    ["exactIngestionCutoff", "ingestionCutoff"],
  ] as const;
  for (const [key, displayKey] of pairs) {
    const exact = value[key];
    if (exact === undefined) continue;
    const exactMillis = typeof exact === "string" ? Date.parse(exact) : NaN;
    const display = value[displayKey];
    const displayMillis = typeof display === "string" ? Date.parse(display) : NaN;
    if (typeof exact !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(exact) ||
        !Number.isFinite(exactMillis) || !Number.isFinite(displayMillis) ||
        new Date(exactMillis).toISOString() !== `${exact.slice(0, 23)}Z` ||
        new Date(displayMillis).toISOString() !== `${exact.slice(0, 23)}Z`) {
      invalid(key);
    }
  }
};

const optionalAuthority = (value: unknown): void => {
  if (value === undefined) return;
  const record = requireRecord(value, "promotion authorityAttestation");
  exactKeys(record, authorityKeys, [], "promotion authorityAttestation");
  strings(record, ["status", "attestedBy"]);
  booleans(record, ["official", "trusted"]);
  exactValue(record.status, "attested", "authority.status");
  oneOf(record.attestedBy, ["producer", "source_catalog"], "authority.attestedBy");
};

const optionalRelation = (value: unknown): void => {
  if (value === undefined) return;
  const record = requireRecord(value, "promotion relation");
  exactKeys(record, relationKeys, [], "promotion relation");
  strings(record, ["kind", "targetCanonicalIdentity"]);
  numbers(record, ["confidence"]);
  units(record, ["confidence"]);
  booleans(record, ["approved"]);
  oneOf(record.kind, ["same_story", "related_topic", "heuristic"], "relation.kind");
};

const assertMetrics = (value: unknown): void => {
  const record = requireRecord(value, "promotion metrics");
  const provider = record.provider;
  const keys = provider === "x"
    ? ["provider", "likes", "reposts", "weightedScore"]
    : provider === "reddit"
      ? ["provider", "score"]
      : provider === "hacker_news"
        ? ["provider", "points"]
        : provider === "github_radar"
          ? ["provider", "snapshotKind", "windowStartedAt", "windowEndedAt",
              "starsDelta", "forksDelta"]
          : null;
  if (keys === null) throw new Error("Invalid promotion field: metrics.provider");
  const optional = provider === "reddit"
    ? ["upvoteRatio"]
    : [];
  exactKeys(record, keys, optional, "promotion metrics");
  strings(record, provider === "github_radar" ? ["provider", "snapshotKind"] : ["provider"]);
  numbers(record, keys.filter((key) =>
    !["provider", "snapshotKind", "windowStartedAt", "windowEndedAt"].includes(key),
  ));
  optionalNumbers(record, optional);
  for (const key of [...keys, ...optional]) {
    if (["provider", "snapshotKind", "windowStartedAt", "windowEndedAt",
      "upvoteRatio"].includes(key) ||
        record[key] === undefined) continue;
    nonNegativeInteger(record[key], `metrics.${key}`);
  }
  if (provider === "reddit" && record.upvoteRatio !== undefined &&
      ((record.upvoteRatio as number) < 0 || (record.upvoteRatio as number) > 1)) {
    invalid("metrics.upvoteRatio");
  }
  if (provider === "x" && record.weightedScore !==
      (record.likes as number) + 2 * (record.reposts as number)) {
    invalid("metrics.weightedScore");
  }
  if (provider === "github_radar")
    exactValue(record.snapshotKind, "repository_growth", "metrics.snapshotKind");
  if (provider === "github_radar") dates(record, ["windowStartedAt", "windowEndedAt"], []);
};

const exactKeys = (
  value: Record<string, unknown>, required: readonly string[],
  optional: readonly string[], label: string,
): void => {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !allowed.has(key)) ||
      Object.values(value).some((nested) => nested === null || nested === undefined)) {
    throw new Error(`${label} must match the exact schema`);
  }
};
const requireRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};
const requireArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
};
const strings = (value: Record<string, unknown>, keys: readonly string[]): void => {
  for (const key of keys) if (typeof value[key] !== "string" || (value[key] as string).trim() === "") invalid(key);
};
const numbers = (value: Record<string, unknown>, keys: readonly string[]): void => {
  for (const key of keys) if (typeof value[key] !== "number" || !Number.isFinite(value[key])) invalid(key);
};
const optionalNumbers = (value: Record<string, unknown>, keys: readonly string[]): void => {
  for (const key of keys) if (value[key] !== undefined &&
    (typeof value[key] !== "number" || !Number.isFinite(value[key]))) invalid(key);
};
const booleans = (value: Record<string, unknown>, keys: readonly string[]): void => {
  for (const key of keys) if (typeof value[key] !== "boolean") invalid(key);
};
const units = (value: Record<string, unknown>, keys: readonly string[]): void => {
  for (const key of keys) if ((value[key] as number) < 0 ||
    (value[key] as number) > 1) invalid(key);
};
const nonNegativeInteger = (value: unknown, key: string): void => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(key);
};
const exactValue = (value: unknown, expected: unknown, key: string): void => {
  if (value !== expected) invalid(key);
};
const oneOf = (value: unknown, allowed: readonly unknown[], key: string): void => {
  if (!allowed.includes(value)) invalid(key);
};
const dates = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[]): void => {
  for (const key of [...required, ...optional]) {
    if (optional.includes(key) && value[key] === undefined) continue;
    const candidate = value[key];
    const date = candidate instanceof Date ? candidate : typeof candidate === "string" ? new Date(candidate) : null;
    if (date === null || !Number.isFinite(date.getTime())) invalid(key);
  }
};
const stringArray = (value: unknown, label: string): void => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) invalid(label);
};
const invalid = (key: string): never => { throw new Error(`Invalid promotion field: ${key}`); };
