import type { ReaderSummaryTopicRelationDecision } from "../../domain";
import type { ReaderSummaryTopicRelationVerifierInput } from "../../ports";

/** Resolve requested unordered pair identities before decoding untrusted output. */
export const expectedTopicRelationPairs = (
  relations: ReaderSummaryTopicRelationVerifierInput["relations"],
): ReadonlySet<string> => {
  const expectedPairs = new Set(relations.map(relationPairKey));
  if (expectedPairs.size !== relations.length) {
    throw new Error(
      "Reader summary requested unordered topic relation pairs must be unique",
    );
  }
  return expectedPairs;
};

/** Enforce complete, duplicate-free responses before recording attestation. */
export const assertCompleteTopicRelationPairs = (
  expectedPairs: ReadonlySet<string>,
  decisions: readonly ReaderSummaryTopicRelationDecision[],
): void => {
  const returnedPairs = new Set(decisions.map(relationPairKey));
  if (
    decisions.length !== expectedPairs.size ||
    returnedPairs.size !== expectedPairs.size ||
    [...expectedPairs].some((pair) => !returnedPairs.has(pair))
  ) {
    throw new Error(
      "Reader summary topic relation response must decide every requested pair exactly once",
    );
  }
};

const relationPairKey = (pair: {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
}): string => JSON.stringify([pair.sourceNodeId, pair.targetNodeId].sort());
