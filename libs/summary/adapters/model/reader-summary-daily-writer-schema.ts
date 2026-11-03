import { openAiReaderSummaryJsonSchema } from "./openai-responses-reader-summary-schema";

/** Only daily-editorial requests relax narrative/topic cardinality. Legacy stays unchanged. */
export const dailyEditorialWriterJsonSchema = {
  ...openAiReaderSummaryJsonSchema,
  properties: {
    ...openAiReaderSummaryJsonSchema.properties,
    executiveSummary: { type: "string", maxLength: 6_000 },
    narrativeSections: {
      ...openAiReaderSummaryJsonSchema.properties.narrativeSections,
      maxItems: 10,
    },
    topStories: {
      ...openAiReaderSummaryJsonSchema.properties.topStories,
      maxItems: 10,
    },
    citationMap: {
      ...openAiReaderSummaryJsonSchema.properties.citationMap,
      maxItems: 30,
    },
  },
} as const;
