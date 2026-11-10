import { openAiSummaryEvidenceSchemas } from "./openai-responses-summary-evidence-schema";

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
    qualityFlags: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'no_signal',
          'low_confidence',
          'conflicting_evidence',
          'limited_sources',
        ],
      },
    },
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['level', 'score', 'rationale'],
      properties: {
        level: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
        score: { type: 'number', minimum: 0, maximum: 1 },
        rationale: { type: 'string', minLength: 1, maxLength: 500 },
      },
    },
    noSignalReason: { type: ['string', 'null'] },
  },
} as const;
