import { validateReaderValueAnswers } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";
import { canonicalPromotionPayload, promotionPayloadDigest } from "../../../domain";
import { readerPostPresentationV3Identity } from
  "../../../domain/services/reader-post-presentation-v3";
import { assertV3PublicDisplayHeadlineSealPayload } from
  "./prisma-reader-summary-display-schema";
import { dates, exactKeys, exactValue, invalid, nonEmptyUniqueStringArray,
  nonNegativeInteger, oneOf, requireRecord, strings } from
  "./prisma-reader-summary-promotion-schema-primitives";

export const assertV3PromotionAttestation = (
  item: Record<string, unknown>, index: number,
): void => {
  exactKeys(item, ["schemaVersion", "policyVersion", "digestVersion", "digest",
    "canonicalPayload", "artifactId", "sourceWindowId", "periodStartedAt",
    "periodEndedAt", "ingestionCutoff", "exactIngestionCutoff", "placement", "slot", "candidateId",
    "provider", "canonicalIdentity", "storyId", "publishedAt", "citationIds",
    "decision", "assessment", "comparator", "presentation"], [],
  `promotion attestation ${index}`);
  strings(item, ["schemaVersion", "policyVersion", "digestVersion", "digest",
    "canonicalPayload", "artifactId", "sourceWindowId", "placement", "candidateId",
    "provider", "canonicalIdentity", "storyId", "publishedAt", "decision"]);
  exactValue(item.policyVersion, "reader_post_promotion.v3", "policyVersion");
  exactValue(item.digestVersion, "reader_post_promotion_digest.sha256.v3", "digestVersion");
  if (!/^[0-9a-f]{64}$/u.test(item.digest as string)) invalid("digest");
  dates(item, ["periodStartedAt", "periodEndedAt", "ingestionCutoff"], []);
  if (!canonicalTimestamp(item.exactIngestionCutoff)) invalid("exactIngestionCutoff");
  if (Date.parse(item.exactIngestionCutoff as string) !==
      Date.parse(item.ingestionCutoff as string)) invalid("exactIngestionCutoff");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u
    .test(item.publishedAt as string)) invalid("publishedAt");
  nonNegativeInteger(item.slot, "slot");
  if ((item.slot as number) < 1) invalid("slot");
  oneOf(item.placement, ["top", "additional"], "placement");
  exactValue(item.decision, item.placement === "top" ? "promote_top" :
    "promote_additional", "decision");
  nonEmptyUniqueStringArray(item.citationIds, "citationIds");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    .test(item.candidateId as string)) invalid("candidateId");
  const assessment = requireRecord(item.assessment, "assessment");
  exactKeys(assessment, ["schemaVersion", "assessmentId", "assessedAt",
    "sourceSnapshotSha256", "inputSha256", "rubricVersion", "rubricSha256",
    "modelConfigVersion", "answers"], [], "assessment");
  strings(assessment, ["schemaVersion", "assessmentId", "assessedAt",
    "sourceSnapshotSha256", "inputSha256", "rubricVersion", "rubricSha256",
    "modelConfigVersion"]);
  exactValue(assessment.schemaVersion, "reader_value.v1", "assessment.schemaVersion");
  for (const key of ["sourceSnapshotSha256", "inputSha256", "rubricSha256"] as const) {
    if (!/^[0-9a-f]{64}$/u.test(assessment[key] as string)) invalid(`assessment.${key}`);
  }
  if (!canonicalTimestamp(assessment.assessedAt) ||
      !validateReaderValueAnswers(assessment.answers).ok) invalid("assessment.answers");
  const comparator = requireRecord(item.comparator, "comparator");
  exactKeys(comparator, ["usefulness", "relevance", "publishedAt", "candidateId"],
    [], "comparator");
  const answers = assessment.answers as Record<string, { readonly choice: unknown }>;
  if (comparator.usefulness !== answers.usefulness?.choice ||
      comparator.relevance !== answers.relevance?.choice ||
      !["useful", "important"].includes(comparator.usefulness as string) ||
      !["relevant", "central"].includes(comparator.relevance as string) ||
      comparator.publishedAt !== item.publishedAt ||
      comparator.candidateId !== item.candidateId) invalid("comparator");
  const presentation = requireRecord(item.presentation, "presentation");
  exactKeys(presentation, ["schemaVersion", "presentationInputDigest", "presentationIdentity",
    "displayHeadline"], [], "presentation");
  exactValue(presentation.schemaVersion, "reader_post_presentation.v3",
    "presentation.schemaVersion");
  if (typeof presentation.presentationInputDigest !== "string" ||
      !/^[0-9a-f]{64}$/u.test(presentation.presentationInputDigest)) {
    invalid("presentation.presentationInputDigest");
  }
  if (typeof presentation.presentationIdentity !== "string" ||
      !/^[0-9a-f]{64}$/u.test(presentation.presentationIdentity)) {
    invalid("presentation.presentationIdentity");
  }
  assertV3PublicDisplayHeadlineSealPayload(presentation.displayHeadline);
  if (presentation.presentationIdentity !== readerPostPresentationV3Identity({
    sourceSnapshotSha256: assessment.sourceSnapshotSha256 as string,
    presentationInputDigest: presentation.presentationInputDigest as string,
    displayHeadline: presentation.displayHeadline as never,
  })) invalid("presentation.presentationIdentity");
  const { digest, canonicalPayload, ...canonicalBody } = item;
  if (canonicalPayload !== canonicalPromotionPayload(canonicalBody) ||
      digest !== promotionPayloadDigest(canonicalPayload as string)) invalid("canonicalPayload");
};

const canonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value));
