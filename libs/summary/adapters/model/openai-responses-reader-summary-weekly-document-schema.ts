import {
  readerSummaryWeeklyModelOutputSchemaVersion,
  type ReaderSummaryWeeklyModelInput,
} from "../../ports/reader-summary-weekly-model.port";
import {
  citationIdsSchema,
  stringSchema,
  weeklyStorySchema,
  weeklySectionSchema,
} from "./openai-responses-reader-summary-weekly-evidence-schema";

/** Pure weekly document constraints. The public entrypoint validates the sealed input first. */
export const projectOpenAiReaderSummaryWeeklyDocumentSchema = (
  input: Pick<ReaderSummaryWeeklyModelInput, "sealId" | "sealSha" | "weekStartedOn" | "weekEndedOn">,
  storyIds: readonly string[],
  citationIds: readonly string[],
  certifiedDates: readonly string[],
) => {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "sealId",
      "sealSha",
      "weekStartedOn",
      "weekEndedOn",
      "headline",
      "headlineCitationIds",
      "takeaway",
      "takeawayCitationIds",
      "synthesis",
      "synthesisCitationIds",
      "stories",
      "sections",
    ],
    properties: {
      schemaVersion: { const: readerSummaryWeeklyModelOutputSchemaVersion },
      sealId: { const: input.sealId },
      sealSha: { const: input.sealSha },
      weekStartedOn: { const: input.weekStartedOn },
      weekEndedOn: { const: input.weekEndedOn },
      headline: stringSchema(160, 12),
      headlineCitationIds: citationIdsSchema(citationIds, 12),
      takeaway: stringSchema(320, 20),
      takeawayCitationIds: citationIdsSchema(citationIds, 12),
      synthesis: {
        ...stringSchema(3_200, 80),
        description:
          "One cross-day weekly synthesis, never concatenated daily summaries.",
      },
      synthesisCitationIds: citationIdsSchema(citationIds, 24),
      stories: {
        type: "array",
        minItems: 1,
        maxItems: Math.min(12, storyIds.length),
        description:
          "Stable input story identities; the lead story cites multiple days whenever sealed evidence contains a cross-day story.",
        uniqueItems: true,
        items: { $ref: "#/$defs/story" },
      },
      sections: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        description:
          "Story-organized weekly sections; daily or dated slots are forbidden.",
        uniqueItems: true,
        items: { $ref: "#/$defs/section" },
      },
    },
    $defs: {
      story: weeklyStorySchema(storyIds, citationIds, certifiedDates),
      section: weeklySectionSchema(storyIds, citationIds, certifiedDates),
    },
  };

};
