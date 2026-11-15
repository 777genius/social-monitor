import type { ReaderSummaryTopicRelationDecision } from "../../domain";
import type { ReaderSummaryTopicRelationVerifierInput } from "../../ports";
import { assertCompleteTopicRelationPairs, expectedTopicRelationPairs } from "./agent-runtime-reader-summary-topic-relation-pair-coverage";

export const normalizeDecisions = (
  raw: Record<string, unknown>,
  relations: ReaderSummaryTopicRelationVerifierInput["relations"],
): readonly ReaderSummaryTopicRelationDecision[] => {
  const expectedPairs = expectedTopicRelationPairs(relations);
  const decisions = Array.isArray(raw.decisions)
    ? raw.decisions.flatMap((value) => {
        if (!isRecord(value)) {
          return [];
        }
        const sourceNodeId = stringValue(value.sourceNodeId);
        const targetNodeId = stringValue(value.targetNodeId);
        const sameTopic = value.sameTopic;
        const confidenceScore = value.confidenceScore;
        if (
          sourceNodeId === undefined ||
          targetNodeId === undefined ||
          typeof sameTopic !== "boolean" ||
          typeof confidenceScore !== "number" ||
          confidenceScore < 0 ||
          confidenceScore > 1
        ) {
          return [];
        }

        return [
          {
            sourceNodeId,
            targetNodeId,
            sameTopic,
            confidenceScore,
            rationale: stringValue(value.rationale),
          },
        ];
      })
    : [];
  assertCompleteTopicRelationPairs(expectedPairs, decisions);

  return decisions;
};

export const parseJsonObject = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new Error("Reader summary topic relation response must be an object");
  }

  return parsed;
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
