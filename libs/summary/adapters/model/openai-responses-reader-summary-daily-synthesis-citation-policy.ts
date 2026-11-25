import type { SummaryEvidenceSelection } from "../../domain";
import {
  buildReaderSummaryEvidenceCitationMap,
  readerSummaryCitableEvidence,
} from "./reader-summary-evidence-citation-map";
import type { dailySynthesisReaderSummaryJsonSchema } from "./openai-responses-reader-summary-daily-writer-schema";

/**
 * Bind a versioned writer schema to the assigned, citable evidence.
 * The static schema owner never needs to know which feed items are trusted.
 */
export const constrainDailySynthesisCitations = (
  input: {
    readonly dailyEditorialPlan: {
      readonly version: string;
      readonly topics?: readonly { readonly feedItemIds: readonly string[] }[];
    };
    readonly evidence?: SummaryEvidenceSelection;
  },
  schema: typeof dailySynthesisReaderSummaryJsonSchema,
) => {
  const assigned = new Set(input.dailyEditorialPlan.topics?.flatMap(topic => topic.feedItemIds) ?? []);
  const stories = new Set(input.evidence?.dailyGenerationInput?.selected.filter(item => assigned.has(item.feedItemId)).map(item => item.storyId));
  if (input.evidence === undefined) return schema;
  const permitted = buildReaderSummaryEvidenceCitationMap(readerSummaryCitableEvidence(input.evidence))
    .filter(citation => assigned.has(citation.feedItemId)).map(citation => citation.citationId);
  const citationIds = schema.$defs.narrativeSection.properties.citationIds;
  return {...schema,$defs:{...schema.$defs,narrativeSection:{
    ...schema.$defs.narrativeSection,
    properties:{...schema.$defs.narrativeSection.properties,
      citationIds: {...citationIds, minItems: stories.size < 2 ? 1 : 2,
        items: {...citationIds.items, enum: permitted}}},
  }}};
};
