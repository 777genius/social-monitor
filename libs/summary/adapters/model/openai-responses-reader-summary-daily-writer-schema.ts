import type { SummaryEvidenceSelection } from "../../domain";
import {
  buildReaderSummaryEvidenceCitationMap,
  readerSummaryCitableEvidence,
} from "./reader-summary-evidence-citation-map";
import {
  openAiReaderSummaryJsonSchema,
  stringSchema,
  arraySchema,
  stringArraySchema,
} from "./openai-responses-reader-summary-base-schema";

/** Extra room only for the versioned daily editorial writer. */
export const dailyEditorialReaderSummaryJsonSchema = {
  ...openAiReaderSummaryJsonSchema,
  $defs: {
    ...openAiReaderSummaryJsonSchema.$defs,
    narrativeSection: {
      ...openAiReaderSummaryJsonSchema.$defs.narrativeSection,
      properties: {
        ...openAiReaderSummaryJsonSchema.$defs.narrativeSection.properties,
        text: { ...stringSchema(1_600), minLength: 1 },
      },
    },
  },
  properties: {
    ...openAiReaderSummaryJsonSchema.properties,
    executiveSummary: stringSchema(5_000),
    narrativeSections: arraySchema({ $ref: "#/$defs/narrativeSection" }, 10),
    topStories: arraySchema({ $ref: "#/$defs/topStory" }, 10),
  },
} as const;

/** Synthesis v2 is a different response contract; legacy event narratives remain unchanged. */
export const dailySynthesisReaderSummaryJsonSchema = {
  ...dailyEditorialReaderSummaryJsonSchema,
  $defs: {...dailyEditorialReaderSummaryJsonSchema.$defs, narrativeSection: {
    ...dailyEditorialReaderSummaryJsonSchema.$defs.narrativeSection,
    properties: {...dailyEditorialReaderSummaryJsonSchema.$defs.narrativeSection.properties,
      kind: {enum:["lead","secondary_signal"]}, storyClusterId:{type:"null"},
      citationIds:{...stringArraySchema(3),minItems:1},
    },
  }},
  properties:{...dailyEditorialReaderSummaryJsonSchema.properties,
    narrativeSections:{...arraySchema({$ref:"#/$defs/narrativeSection"},6),minItems:1},
  },
} as const;
export function readerSummaryWriterSchema(input: {
  readonly dailyEditorialPlan?: {readonly version:string; readonly topics?: readonly {readonly feedItemIds:readonly string[]}[]};
  readonly evidence?: SummaryEvidenceSelection;
}) {
  if (input.dailyEditorialPlan === undefined) return openAiReaderSummaryJsonSchema;
  if (input.dailyEditorialPlan.version !== "reader_summary.daily_editorial.v2") return dailyEditorialReaderSummaryJsonSchema;
  const assigned = new Set(input.dailyEditorialPlan.topics?.flatMap(topic => topic.feedItemIds) ?? []);
  const stories = new Set(input.evidence?.dailyGenerationInput?.selected.filter(item => assigned.has(item.feedItemId)).map(item => item.storyId));
  if (input.evidence === undefined) return dailySynthesisReaderSummaryJsonSchema;
  const permitted = buildReaderSummaryEvidenceCitationMap(readerSummaryCitableEvidence(input.evidence))
    .filter(citation => assigned.has(citation.feedItemId)).map(citation => citation.citationId);
  const citationIds = dailySynthesisReaderSummaryJsonSchema.$defs.narrativeSection.properties.citationIds;
  return {...dailySynthesisReaderSummaryJsonSchema,$defs:{...dailySynthesisReaderSummaryJsonSchema.$defs,narrativeSection:{
    ...dailySynthesisReaderSummaryJsonSchema.$defs.narrativeSection,
    properties:{...dailySynthesisReaderSummaryJsonSchema.$defs.narrativeSection.properties,
      citationIds: {...citationIds, minItems: stories.size < 2 ? 1 : 2,
        items: {...citationIds.items, enum: permitted}}},
  }}};
}
