// Provider-specific evidence contract: citations, claims and risk references.
// Preserve the exact JSON Schema field constraints used by the root output contract.
export const openAiSummaryEvidenceSchemas = {
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
} as const;
