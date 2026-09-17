import { isDeepStrictEqual } from "node:util";

import type { HistoricalPromotionArtifactVerification } from
  "./reader-summary-promotion-v2-historical-artifact";

const publicAttestationFields = [
  "schemaVersion",
  "policyVersion",
  "digestVersion",
  "digest",
  "canonicalPayload",
  "artifactId",
  "sourceWindowId",
  "slot",
  "candidateId",
  "canonicalIdentity",
  "placement",
  "decision",
  "citationIds",
] as const;

const publicV2AttestationFields = [
  "displayHeadline",
  "displaySummary",
  "storyClusterId",
  "scoreComponents",
  "reasonCodes",
  "candidateDigestInput",
  "slateEntryDigestInput",
  "slateDigestInput",
  "slateDigest",
  "evidenceLineage",
] as const;

export const publicPromotionAttestationMatches = (
  actual: unknown,
  durable: unknown,
): boolean => {
  if (!isRecord(actual) || !isRecord(durable)) return false;
  const fields = durable.schemaVersion ===
      "reader_post_promotion_attestation.v2"
    ? [...publicAttestationFields, ...publicV2AttestationFields]
    : publicAttestationFields;
  const expected = Object.fromEntries(fields.flatMap((field) =>
    Object.hasOwn(durable, field) ? [[field, durable[field]]] : []
  ));
  return isDeepStrictEqual(jsonValue(actual), jsonValue(expected));
};

export const assertHistoricalPromotionPublicArtifact = (
  item: Record<string, unknown>,
  expected: HistoricalPromotionArtifactVerification,
  surface = "API",
): void => {
  const brief = isRecord(item.readerBrief) ? item.readerBrief : item;
  const top = publicLane(brief.topReads);
  const additional = publicLane(brief.selectedPosts);
  if (!publicLaneMatches(top, expected.orderedLanes.top) ||
      !publicLaneMatches(additional, expected.orderedLanes.additional)) {
    throw new Error(
      `Historical promotion ${surface} ordered V2 tuple is inconsistent`,
    );
  }
  if (expected.noSignal &&
      (!Array.isArray(item.qualityFlags) ||
        !item.qualityFlags.includes("no_signal") ||
        !isRecord(item.lineage) ||
        item.lineage.promptVersion !== "reader_summary.promotion_no_signal.v1" ||
        item.lineage.modelVersion !== "not_invoked" ||
        item.lineage.providerVersion !== "deterministic" ||
        item.lineage.rulesVersion !== "reader_promotion_policy.v2" ||
        item.lineage.evalDatasetVersion !== "reader_promotion_policy.v2")) {
    throw new Error(
      `Historical promotion ${surface} V2 NO_SIGNAL lineage is missing`,
    );
  }
};

const publicLane = (value: unknown): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error("Historical promotion API reader lane is missing");
  }
  return value.map((card) => {
    if (!isRecord(card) || !isRecord(card.promotionAttestation)) {
      throw new Error("Historical promotion API card tuple is missing");
    }
    return card.promotionAttestation;
  });
};

const publicLaneMatches = (
  actual: readonly unknown[],
  durable: readonly unknown[],
): boolean => actual.length === durable.length &&
  actual.every((item, index) =>
    publicPromotionAttestationMatches(item, durable[index])
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const jsonValue = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value)) as unknown;
