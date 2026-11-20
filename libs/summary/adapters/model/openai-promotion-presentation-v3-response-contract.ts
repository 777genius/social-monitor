import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";
import { assertPresentationShape } from "./openai-promotion-presentation-v3-item-contract";


export const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("V3 presentation item is invalid");
  }
  return value as Record<string, unknown>;
};

const validatedPresentationBatch = (
  value: unknown,
  inputs: readonly ReaderPostPresentationV3Input[],
): ReadonlyMap<string, Record<string, unknown>> => {
  if (!Array.isArray(value) || value.length !== inputs.length) {
    throw new Error("V3 presentation returned an invalid batch");
  }
  const requested = new Set(inputs.map((input) => input.candidateId));
  const proposals = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    const proposal = record(item);
    assertPresentationShape(proposal);
    const candidateId = proposal.candidateId as string;
    if (!requested.has(candidateId) || proposals.has(candidateId)) {
      throw new Error("V3 presentation returned an invalid candidate identity");
    }
    proposals.set(candidateId, proposal);
  }
  if (proposals.size !== requested.size ||
      [...requested].some((candidateId) => !proposals.has(candidateId))) {
    throw new Error("V3 presentation returned an incomplete candidate batch");
  }
  return proposals;
};

export const validatedPresentationRoot = (
  value: unknown,
  inputs: readonly ReaderPostPresentationV3Input[],
): ReadonlyMap<string, Record<string, unknown>> => {
  const root = record(value);
  const keys = Object.keys(root);
  if (keys.length !== 1 || keys[0] !== "presentations") {
    throw new Error("V3 presentation response root violates the response contract");
  }
  return validatedPresentationBatch(root.presentations, inputs);
};
