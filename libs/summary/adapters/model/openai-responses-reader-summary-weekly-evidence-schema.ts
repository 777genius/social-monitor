import {
  readerSummaryWeeklyClaimTypes,
  readerSummaryWeeklySectionKinds,
  readerSummaryWeeklyStoryStatuses,
} from "../../ports/reader-summary-weekly-model.port";

/** Evidence-constrained child contracts; the weekly envelope composes them. */
export const weeklyStorySchema = (
  storyIds: readonly string[],
  citationIds: readonly string[],
  certifiedDates: readonly string[],
) => objectSchema(
        [
          "storyId",
          "headline",
          "summary",
          "status",
          "observedFrom",
          "observedThrough",
          "citationIds",
        ],
        {
          storyId: { enum: storyIds },
          headline: stringSchema(180, 8),
          summary: stringSchema(1_200, 30),
          status: { enum: [...readerSummaryWeeklyStoryStatuses] },
          observedFrom: certifiedDateSchema(certifiedDates),
          observedThrough: certifiedDateSchema(certifiedDates),
          citationIds: citationIdsSchema(citationIds, 24),
        },
      );

export const weeklySectionSchema = (
  storyIds: readonly string[],
  citationIds: readonly string[],
  certifiedDates: readonly string[],
) => objectSchema(
        [
          "sectionId",
          "storyId",
          "kind",
          "claimType",
          "heading",
          "text",
          "observedFrom",
          "observedThrough",
          "citationIds",
        ],
        {
          sectionId: stringSchema(160, 1),
          storyId: { enum: storyIds },
          kind: { enum: [...readerSummaryWeeklySectionKinds] },
          claimType: { enum: [...readerSummaryWeeklyClaimTypes] },
          heading: stringSchema(140, 4),
          text: stringSchema(1_200, 30),
          observedFrom: certifiedDateSchema(certifiedDates),
          observedThrough: certifiedDateSchema(certifiedDates),
          citationIds: citationIdsSchema(citationIds, 24),
        },
        "A story-organized section. The lead carries its stable story across multiple days when sealed evidence supports one; otherwise it remains a grounded snapshot.",
      );

const objectSchema = (
  required: readonly string[],
  properties: Readonly<Record<string, unknown>>,
  description?: string,
) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
  ...(description === undefined ? {} : { description }),
});

export const stringSchema = (maxLength: number, minLength: number) => ({
  type: "string",
  minLength,
  maxLength,
});

const certifiedDateSchema = (certifiedDates: readonly string[]) => ({
  type: "string",
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  enum: certifiedDates,
});

export const citationIdsSchema = (
  citationIds: readonly string[],
  maxItems: number,
) => ({
  type: "array",
  minItems: 1,
  maxItems: Math.min(maxItems, citationIds.length),
  uniqueItems: true,
  items: { enum: citationIds },
});
