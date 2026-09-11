import type { TopRead } from "../entities/top-read";
import type { ReaderPostPromotionAttestation } from "../policies/reader-post-promotion-policy-contract";
import type { ReaderCapturedSource, ReaderDisplayHeadlineSeal } from "../value-objects/summary-reader-headline";
import { canonicalPromotionPayload } from "./reader-post-promotion-attestation";
import { readerCapturedSourceDigest, validDisplayHeadlineSource } from "./reader-post-display-headline";

const unavailableReasons = ["not_assessed", "invalid_assessment", "incomplete_source",
  "unsafe_text", "unresolved_qualifications", "insufficient_support"];

export const isUnavailableDisplayHeadline = (value: unknown): boolean => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && record.status === "unavailable" &&
    unavailableReasons.includes(String(record.reasonCode));
};

export const validCapturedReaderSource = (value: unknown): value is ReaderCapturedSource => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return typeof source.title === "string" &&
    ["title", "body", "captureAvailability", "reviewAvailability"].every((key) =>
      key === "body" || Object.hasOwn(source, key)) &&
    Object.keys(source).every((key) => ["title", "body", "captureAvailability", "reviewAvailability"].includes(key)) &&
    (source.body === undefined ? source.captureAvailability === "unavailable"
      : typeof source.body === "string" && source.captureAvailability === "available") &&
    ["body_present", "title_only", "unavailable"].includes(String(source.reviewAvailability));
};

/** Integrity check only. Callers must retain existing trusted producer checks. */
export const readerDisplayIdentityMatches = (
  card: Pick<TopRead, "title" | "providerKey" | "promotionCandidateId" | "capturedSource" | "displayHeadline">,
  seal: ReaderDisplayHeadlineSeal | undefined,
  scope?: Readonly<{ tenantId: string; workspaceId: string }>,
): boolean => {
  if (seal === undefined || !validCapturedReaderSource(card.capturedSource) ||
      canonicalPromotionPayload(seal.headline) !== canonicalPromotionPayload(card.displayHeadline)) return false;
  if (isUnavailableDisplayHeadline(seal.headline)) {
    return Object.keys(seal).length === 1;
  }
  if (Object.keys(seal).length !== 2 ||
      !validDisplayHeadlineSource(seal.headline, card.capturedSource)) return false;
  const headline = seal.headline;
  return headline.text === card.title && headline.binding.candidateId === card.promotionCandidateId &&
    headline.binding.providerKey === card.providerKey &&
    (scope === undefined || (headline.binding.tenantId === scope.tenantId &&
      headline.binding.workspaceId === scope.workspaceId)) &&
    seal.capturedSourceDigest === readerCapturedSourceDigest(card.capturedSource);
};

export const assertReaderDisplayIdentity = (
  card: TopRead, attestation: ReaderPostPromotionAttestation,
  scope: Readonly<{ tenantId: string; workspaceId: string }>,
): void => {
  const seal = attestation.schemaVersion === "reader_post_promotion_attestation.v2"
    ? attestation.displayHeadline : undefined;
  // Historical payloads retain source presentation, with no new display authority.
  if (seal === undefined && card.displayHeadline === undefined && card.capturedSource === undefined) return;
  if (!readerDisplayIdentityMatches(card, seal, scope)) {
    throw new Error("Reader promotion display identity is invalid");
  }
};

/** Detach nested annotations from external references before artifact storage. */
export const immutableDisplayValue = <T>(value: T): T => {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableDisplayValue)) as T;
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(
      ([key, child]) => [key, immutableDisplayValue(child)],
    ))) as T;
  }
  return value;
};
