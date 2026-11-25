// Provider output quality and confidence contract, independent of evidence citations.
export const openAiSummaryQualitySchemas = {
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
} as const;
