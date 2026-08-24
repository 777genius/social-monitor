import type {
  ReaderPostPromotionAttestation,
  ReaderSummaryContent,
} from "../../../domain";
import { readerPostPromotionCardFields } from "../../../domain";
import {
  requireArray,
  requireDate,
  requireObject,
} from "./prisma-reader-summary-payload-parsers";
import { assertExactPromotionAttestationPayload } from
  "./prisma-reader-summary-promotion-schema";

export const normalizePromotionAttestations = (
  value: unknown,
): readonly ReaderPostPromotionAttestation[] => {
  if (value === undefined) return [];
  assertExactPromotionAttestationPayload(value);
  return requireArray<Record<string, unknown>>(
      value,
      "Reader summary promotion attestations",
    ).map((item) => ({
      ...(item as unknown as ReaderPostPromotionAttestation),
      periodStartedAt: requireDate(
        item.periodStartedAt,
        "Reader summary promotion period start",
      ),
      periodEndedAt: requireDate(
        item.periodEndedAt,
        "Reader summary promotion period end",
      ),
      ingestionCutoff: requireDate(
        item.ingestionCutoff,
        "Reader summary promotion ingestion cutoff",
      ),
      publishedAt: requireDate(
        item.publishedAt,
        "Reader summary promotion publication time",
      ),
      observedAt: requireDate(
        item.observedAt,
        "Reader summary promotion observation time",
      ),
      ...(item.checkedAt === undefined ? {} : {
        checkedAt: requireDate(
          item.checkedAt,
          "Reader summary promotion check time",
        ),
      }),
      ...(item.metrics === undefined
        ? {}
        : { metrics: normalizePromotionMetrics(item.metrics) }),
      supportFacts: normalizeSupportFacts(item.supportFacts),
    }));
};

export const normalizePromotionEvidenceFacts = (
  value: unknown,
): ReaderPostPromotionAttestation["supportFacts"] =>
  value === undefined ? [] : normalizeSupportFacts(value);

export const normalizePersistedPromotionBoard = (input: {
  readonly promotionAttestations: unknown;
  readonly promotionEvidenceFacts: unknown;
  readonly content: ReaderSummaryContent | undefined;
}): Readonly<{
  promotionAttestations: readonly ReaderPostPromotionAttestation[];
  promotionEvidenceFacts: ReaderPostPromotionAttestation["supportFacts"];
  content: ReaderSummaryContent | undefined;
  promotionBoardState?: "legacy_unavailable";
}> => {
  const promotionAttestations = normalizePromotionAttestations(
    input.promotionAttestations,
  );
  const promotionEvidenceFacts = normalizePromotionEvidenceFacts(
    input.promotionEvidenceFacts,
  );
  if (!isPrePromotionPersistedBoard(input)) {
    return {
      promotionAttestations,
      promotionEvidenceFacts,
      content: input.content,
    };
  }

  return {
    promotionAttestations: [],
    promotionEvidenceFacts: [],
    content: input.content,
    promotionBoardState: "legacy_unavailable",
  };
};

const isPrePromotionPersistedBoard = (input: {
  readonly promotionAttestations: unknown;
  readonly promotionEvidenceFacts: unknown;
  readonly content: ReaderSummaryContent | undefined;
}): boolean => {
  if (
    input.promotionAttestations !== undefined ||
    input.promotionEvidenceFacts !== undefined
  ) {
    return false;
  }

  const content = input.content;
  if (content === undefined) return true;
  const cards = [
    ...content.topReads,
    ...(content.selectedPosts ?? []),
    ...content.interestSections.flatMap((section) => section.items),
  ];
  return cards.every((card) => readerPostPromotionCardFields.every(
    (field) => !Object.prototype.hasOwnProperty.call(card, field),
  ));
};

const normalizeSupportFacts = (
  value: unknown,
): ReaderPostPromotionAttestation["supportFacts"] =>
  requireArray<Record<string, unknown>>(
    value,
    "Reader summary promotion support facts",
  ).map((item) => ({
    ...(item as unknown as ReaderPostPromotionAttestation["supportFacts"][number]),
    publishedAt: requireDate(item.publishedAt, "Promotion support publication time"),
    observedAt: requireDate(item.observedAt, "Promotion support observation time"),
    periodStart: requireDate(item.periodStart, "Promotion support period start"),
    periodEnd: requireDate(item.periodEnd, "Promotion support period end"),
    ingestionCutoff: requireDate(
      item.ingestionCutoff,
      "Promotion support ingestion cutoff",
    ),
    ...(item.checkedAt === undefined ? {} : {
      checkedAt: requireDate(item.checkedAt, "Promotion support check time"),
    }),
    ...(item.metrics === undefined
      ? {}
      : { metrics: normalizePromotionMetrics(item.metrics) }),
  }));

const normalizePromotionMetrics = (
  value: unknown,
): NonNullable<ReaderPostPromotionAttestation["metrics"]> => {
  const metrics = requireObject<Record<string, unknown>>(
    value,
    "Reader summary promotion metrics",
  );
  if (metrics.provider !== "github_radar") {
    return metrics as unknown as NonNullable<
      ReaderPostPromotionAttestation["metrics"]
    >;
  }
  return {
    ...(metrics as unknown as Extract<
      NonNullable<ReaderPostPromotionAttestation["metrics"]>,
      { readonly provider: "github_radar" }
    >),
    windowStartedAt: requireDate(
      metrics.windowStartedAt,
      "Reader summary GitHub promotion window start",
    ),
    windowEndedAt: requireDate(
      metrics.windowEndedAt,
      "Reader summary GitHub promotion window end",
    ),
  };
};
