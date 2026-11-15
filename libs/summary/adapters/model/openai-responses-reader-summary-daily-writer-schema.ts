import type { SummaryEvidenceSelection } from "../../domain";
import { constrainDailySynthesisCitations } from "./openai-responses-reader-summary-daily-synthesis-citation-policy";
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
  return constrainDailySynthesisCitations({
    dailyEditorialPlan: input.dailyEditorialPlan,
    evidence: input.evidence,
  }, dailySynthesisReaderSummaryJsonSchema);
}
