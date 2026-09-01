import {
  canonicalPromotionPayload,
  promotionPayloadDigest,
  readerPostProviderFamily,
} from "../../../domain";
import { assertExactPromotionMetrics } from
  "./prisma-reader-summary-promotion-metrics-schema";

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
const v2Required = [
  "storyClusterId", "scoreComponents", "reasonCodes",
  "candidateDigestInput", "slateEntryDigestInput", "slateDigestInput",
  "slateDigest", "evidenceLineage",
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
const scoreComponentKeys = [
  "engagementSalience", "relevance", "evidenceQuality", "integrity",
  "freshness", "weightedEngagement", "weightedRelevance",
  "weightedEvidenceQuality", "weightedIntegrity", "weightedFreshness",
  "total",
] as const;
const evidenceLineageKeys = [
  "leadCandidateId", "leadCitationId", "supportCandidateIds",
  "supportCitationIds", "citationIds",
] as const;

export const assertExactPromotionAttestationPayload = (value: unknown): void => {
  const items = requireArray(value, "promotion attestations");
  for (const [index, raw] of items.entries()) {
    const item = requireRecord(raw, `promotion attestation ${index}`);
    const isV1 = item.schemaVersion ===
      "reader_post_promotion_attestation.v1";
    const isV2 = item.schemaVersion ===
      "reader_post_promotion_attestation.v2";
    if (!isV1 && !isV2) invalid("schemaVersion");
    exactKeys(
      item,
      isV2 ? [...topRequired, ...v2Required] : topRequired,
      topOptional,
      `promotion attestation ${index}`,
    );
    strings(item, ["schemaVersion", "policyVersion", "digestVersion", "digest",
      "canonicalPayload", "artifactId", "sourceWindowId", "placement",
      "candidateId", "provider", "contentKind", "canonicalIdentity",
      "citationId", "metricsState", "tier", "decision", "reason",
      "canonicalDedupeOutcome", "capOutcome"]);
    optionalExactTimestamps(item);
    numbers(item, ["slot", "qualityScore", "relevanceScore", "integrityScore",
      "providerCount", "confidence"]);
    nonNegativeInteger(item.slot, "slot");
    if (isV2 && (item.slot as number) < 1) invalid("slot");
    nonNegativeInteger(item.providerCount, "providerCount");
    if ((item.providerCount as number) < 1) invalid("providerCount");
    units(item, ["qualityScore", "relevanceScore", "integrityScore", "confidence"]);
    booleans(item, ["freshnessValid", "qualityValid", "safetyValid", "citationValid"]);
    dates(item, ["periodStartedAt", "periodEndedAt", "ingestionCutoff",
      "publishedAt", "observedAt"], ["checkedAt"]);
    stringArray(item.citationIds, "promotion citationIds");
    assertUsefulness(item.usefulnessComponents);
    exactValue(
      item.policyVersion,
      isV2 ? "reader_post_promotion.v2" : "reader_post_promotion.v1",
      "policyVersion",
    );
    exactValue(
      item.digestVersion,
      isV2
        ? "reader_post_promotion_digest.sha256.v2"
        : "reader_post_promotion_digest.sha256.v1",
      "digestVersion",
    );
    if (!/^[0-9a-f]{64}$/u.test(item.digest as string)) invalid("digest");
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
    if (item.metrics !== undefined) assertExactPromotionMetrics(item.metrics);
    const supportFacts = requireArray(
      item.supportFacts, "promotion supportFacts",
    );
    for (const [supportIndex, supportRaw] of supportFacts.entries()) {
      assertSupportFact(supportRaw, `${index}.${supportIndex}`);
    }
    if (isV2) assertV2EditorialFields(item, supportFacts);
    const { digest, canonicalPayload, ...canonicalBody } = item;
    if (canonicalPayload !== canonicalPromotionPayload(canonicalBody) ||
        digest !== promotionPayloadDigest(canonicalPayload as string)) {
      invalid("canonicalPayload");
    }
  }
};

const assertV2EditorialFields = (
  item: Record<string, unknown>,
  supportFacts: readonly unknown[],
): void => {
  strings(item, [
    "storyClusterId", "candidateDigestInput", "slateEntryDigestInput",
    "slateDigestInput", "slateDigest",
  ]);
  if (!/^[0-9a-f]{64}$/u.test(item.slateDigest as string)) {
    invalid("slateDigest");
  }
  if (promotionPayloadDigest(item.slateDigestInput as string) !==
      item.slateDigest) {
    invalid("slateDigest");
  }
  assertCandidateDigestInput(item);
  nonEmptyUniqueStringArray(item.reasonCodes, "reasonCodes");
  assertScoreComponents(item.scoreComponents);
  const lineage = requireRecord(
    item.evidenceLineage,
    "promotion evidenceLineage",
  );
  exactKeys(
    lineage,
    evidenceLineageKeys,
    [],
    "promotion evidenceLineage",
  );
  strings(lineage, ["leadCandidateId", "leadCitationId"]);
  const supportCandidateIds = stringArray(
    lineage.supportCandidateIds,
    "evidenceLineage.supportCandidateIds",
  );
  const supportCitationIds = stringArray(
    lineage.supportCitationIds,
    "evidenceLineage.supportCitationIds",
  );
  const lineageCitationIds = nonEmptyUniqueStringArray(
    lineage.citationIds,
    "evidenceLineage.citationIds",
  );
  const citationIds = nonEmptyUniqueStringArray(
    item.citationIds,
    "promotion citationIds",
  );
  const supportRecords = supportFacts.map((fact, index) =>
    requireRecord(fact, `promotion support fact lineage ${index}`));
  if (lineage.leadCandidateId !== item.candidateId ||
      lineage.leadCitationId !== item.citationId ||
      !sameOrdered(
        supportCandidateIds,
        supportRecords.map((fact) => fact.candidateId as string),
      ) ||
      !sameOrdered(
        supportCitationIds,
        supportRecords.map((fact) => fact.citationId as string),
      ) ||
      !sameOrdered(lineageCitationIds, citationIds)) {
    invalid("evidenceLineage");
  }
  assertSlateEntryDigestInput(item);
  assertSlateDigestInput(item);
};

const assertScoreComponents = (value: unknown): void => {
  const record = requireRecord(value, "promotion scoreComponents");
  exactKeys(record, scoreComponentKeys, [], "promotion scoreComponents");
  numbers(record, scoreComponentKeys);
  units(record, [
    "engagementSalience", "relevance", "evidenceQuality", "integrity",
    "freshness",
  ]);
  const weightedKeys = [
    "weightedEngagement", "weightedRelevance", "weightedEvidenceQuality",
    "weightedIntegrity", "weightedFreshness",
  ] as const;
  if (weightedKeys.some((key) => (record[key] as number) < 0) ||
      (record.total as number) < 0 ||
      Math.abs(weightedKeys.reduce(
        (total, key) => total + (record[key] as number),
        0,
      ) - (record.total as number)) > 1e-12) {
    invalid("scoreComponents.total");
  }
};

const assertSlateEntryDigestInput = (
  item: Record<string, unknown>,
): void => {
  const raw = item.slateEntryDigestInput;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw as string);
  } catch {
    invalid("slateEntryDigestInput");
  }
  const entry = requireRecord(decoded, "promotion slateEntryDigestInput");
  exactKeys(entry, [
    "policyVersion", "placement", "slot", "candidateId",
    "canonicalIdentity", "provider", "storyClusterId", "scoreComponents",
    "reasonCodes", "candidateDigestInput",
  ], [], "promotion slateEntryDigestInput");
  if (entry.policyVersion !== "reader_promotion_policy.v2" ||
      entry.placement !== item.placement || entry.slot !== item.slot ||
      entry.candidateId !== item.candidateId ||
      entry.canonicalIdentity !== item.canonicalIdentity ||
      entry.provider !== editorialProvider(item.provider) ||
      entry.storyClusterId !== item.storyClusterId ||
      canonicalPromotionPayload(entry.scoreComponents) !==
        canonicalPromotionPayload(item.scoreComponents) ||
      JSON.stringify(entry.reasonCodes) !== JSON.stringify(item.reasonCodes) ||
      entry.candidateDigestInput !== item.candidateDigestInput) {
    invalid("slateEntryDigestInput");
  }
};

const assertCandidateDigestInput = (
  item: Record<string, unknown>,
): void => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(item.candidateDigestInput as string);
  } catch {
    invalid("candidateDigestInput");
  }
  const candidate = requireRecord(
    decoded,
    "promotion candidateDigestInput",
  );
  if (candidate.policyVersion !== "reader_promotion_policy.v2" ||
      candidate.candidateId !== item.candidateId ||
      candidate.canonicalIdentity !== item.canonicalIdentity ||
      candidate.provider !== editorialProvider(item.provider)) {
    invalid("candidateDigestInput");
  }
};

const assertSlateDigestInput = (item: Record<string, unknown>): void => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(item.slateDigestInput as string);
  } catch {
    invalid("slateDigestInput");
  }
  const slate = requireRecord(decoded, "promotion slateDigestInput");
  exactKeys(slate, [
    "policyVersion", "sourceWindow", "orderedCandidateIds",
    "orderedCanonicalIdentities", "digestInputs",
  ], [], "promotion slateDigestInput");
  const sourceWindow = requireRecord(
    slate.sourceWindow,
    "promotion slateDigestInput sourceWindow",
  );
  exactKeys(sourceWindow, [
    "windowId", "startedAt", "endedAt", "periodStartedAt",
    "periodEndedAt", "ingestionCutoff",
  ], [], "promotion slateDigestInput sourceWindow");
  const candidateIds = nonEmptyUniqueStringArray(
    slate.orderedCandidateIds,
    "slateDigestInput.orderedCandidateIds",
  );
  const canonicalIdentities = nonEmptyUniqueStringArray(
    slate.orderedCanonicalIdentities,
    "slateDigestInput.orderedCanonicalIdentities",
  );
  const digestInputs = nonEmptyUniqueStringArray(
    slate.digestInputs,
    "slateDigestInput.digestInputs",
  );
  const candidateIndex = candidateIds.indexOf(item.candidateId as string);
  if (slate.policyVersion !== "reader_promotion_policy.v2" ||
      sourceWindow.windowId !== item.sourceWindowId ||
      sourceWindow.periodStartedAt !== item.periodStartedAt ||
      sourceWindow.periodEndedAt !== item.periodEndedAt ||
      sourceWindow.ingestionCutoff !== item.ingestionCutoff ||
      candidateIds.length !== canonicalIdentities.length ||
      candidateIds.length !== digestInputs.length || candidateIndex < 0 ||
      canonicalIdentities[candidateIndex] !== item.canonicalIdentity ||
      digestInputs[candidateIndex] !== item.slateEntryDigestInput ||
      (item.placement === "top" && candidateIndex !== (item.slot as number) - 1)) {
    invalid("slateDigestInput");
  }
};

const editorialProvider = (provider: unknown): string | undefined => {
  if (typeof provider !== "string") return undefined;
  const family = readerPostProviderFamily(provider);
  return family === "github_radar" ? "github" : family;
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
  if (item.metrics !== undefined) assertExactPromotionMetrics(item.metrics);
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
const stringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) invalid(label);
  return value as string[];
};
const nonEmptyUniqueStringArray = (
  value: unknown,
  label: string,
): string[] => {
  const items = stringArray(value, label);
  if (items.length === 0 || new Set(items).size !== items.length) invalid(label);
  return items;
};
const sameOrdered = (
  left: readonly string[],
  right: readonly string[],
): boolean => left.length === right.length &&
  left.every((value, index) => value === right[index]);
const invalid = (key: string): never => { throw new Error(`Invalid promotion field: ${key}`); };
