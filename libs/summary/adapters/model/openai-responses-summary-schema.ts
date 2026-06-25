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
    keyPoints: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'citationIds'],
        properties: {
          claim: { type: 'string', minLength: 1, maxLength: 500 },
          citationIds: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    risksAndUnknowns: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'citationIds', 'reason'],
        properties: {
          description: { type: 'string', minLength: 1, maxLength: 500 },
          citationIds: {
            type: ['array', 'null'],
            items: { type: 'string', minLength: 1 },
          },
          reason: {
            type: ['string', 'null'],
            enum: [
              'insufficient_evidence',
              'conflicting_evidence',
              'source_limit',
              null,
            ],
          },
        },
      },
    },
    sourceHighlights: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string', minLength: 1, maxLength: 300 },
    },
    citationMap: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'citationId',
          'feedItemId',
          'sourceItemId',
          'providerKey',
          'field',
        ],
        properties: {
          citationId: { type: 'string', minLength: 1 },
          feedItemId: { type: 'string', minLength: 1 },
          sourceItemId: { type: 'string', minLength: 1 },
          providerKey: { type: 'string', minLength: 1 },
          field: {
            type: 'string',
            enum: ['title', 'bodyPreview', 'canonicalUrl'],
          },
        },
      },
    },
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
