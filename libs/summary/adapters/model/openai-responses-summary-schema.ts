import { openAiSummaryEvidenceSchemas } from "./openai-responses-summary-evidence-schema";
import { openAiSummaryQualitySchemas } from "./openai-responses-summary-quality-schema";

export const openAiSummaryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'headline',
    'executiveSummary',
    'keyPoints',
    'risksAndUnknowns',
    'sourceHighlights',
    'citationMap',
    'qualityFlags',
    'confidence',
    'noSignalReason',
  ],
  properties: {
    headline: { type: 'string', minLength: 1, maxLength: 180 },
    executiveSummary: { type: 'string', minLength: 1, maxLength: 2_000 },
    keyPoints: openAiSummaryEvidenceSchemas.keyPoints,
    risksAndUnknowns: openAiSummaryEvidenceSchemas.risksAndUnknowns,
    sourceHighlights: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string', minLength: 1, maxLength: 300 },
    },
    citationMap: openAiSummaryEvidenceSchemas.citationMap,
    qualityFlags: openAiSummaryQualitySchemas.qualityFlags,
    confidence: openAiSummaryQualitySchemas.confidence,
    noSignalReason: openAiSummaryQualitySchemas.noSignalReason,
  },
} as const;
