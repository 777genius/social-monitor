export const presentationInstructions = `Create a short reader headline for every candidate using only its exact title and sourceText. Preserve every material qualification. Return unavailable when support is insufficient. Evidence offsets are JavaScript UTF-16 offsets into title or the complete sourceText, named bodyPreview. Never use outside knowledge, popularity, prior scores, or candidate order.`;
const reference = { type: "object", additionalProperties: false,
  required: ["field", "start", "end", "quote"], properties: {
    field: { type: "string", enum: ["title", "bodyPreview"] },
    start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 1 },
    quote: { type: "string", minLength: 1, maxLength: 256 } } };
export const presentationSchema = { type: "object", additionalProperties: false,
  required: ["presentations"], properties: { presentations: { type: "array",
    minItems: 1, maxItems: 4, items: { type: "object", additionalProperties: false,
      required: ["candidateId", "status", "kind", "text", "support",
        "qualifications", "confidence", "qualificationJudgment"], properties: {
        candidateId: { type: "string" }, status: { type: "string",
          enum: ["available", "unavailable"] }, kind: { type: "string",
          enum: ["claim", "subject_label"] }, text: { type: "string", maxLength: 119 },
        support: { type: "array", maxItems: 8, items: reference },
        qualifications: { type: "array", maxItems: 8, items: { type: "object",
          additionalProperties: false, required: ["phrase", "evidence"], properties: {
            phrase: { type: "string", maxLength: 119 }, evidence: { type: "array",
              minItems: 1, maxItems: 8, items: reference } } } },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        qualificationJudgment: { type: "string",
          enum: ["none", "preserved", "subject_only"] } } } } } };
