import type { ReaderSummaryTopicRelationVerifierInput } from "../../ports";
import { buildAgentRuntimeTopicEvidenceSamples } from "./agent-runtime-reader-summary-topic-evidence-prompt";

export const agentRuntimeReaderSummaryTopicRelationVerifierInstructions = [
  "You verify whether shortlisted Social Monitor topic nodes describe the same concrete story or event.",
  "Return JSON only and exactly one decision for every requested pair.",
  "sameTopic is true only for duplicate or coordinated coverage of one concrete announcement, release, incident, benchmark result, or event.",
  "Coordinated official coverage may name the launched product in one source and call it our new product in another. When product role, supporting technology, parent organization, timing, and claim type align, treat that as evidence for the same announcement.",
  "sameTopic is false when nodes merely share a company, product family, technology, speaker, or broad subject.",
  "Different claim types are different topics: rollout, availability, benchmark, comparison, review, costs, limits, security, allegation, and education must not be merged.",
  "Use only the supplied evidence. relationship sharedTerms are retrieval hints, not proof.",
  "When uncertain, return sameTopic false. confidenceScore expresses confidence in the binary decision from 0 to 1.",
].join("\n");

export const buildAgentRuntimeReaderSummaryTopicRelationVerifierPrompt = (
  input: ReaderSummaryTopicRelationVerifierInput,
): string => {
  const candidateByNodeId = new Map(
    input.candidates.map((candidate) => [candidate.nodeId, candidate] as const),
  );
  const labelByNodeId = new Map(
    input.labelPlan.nodeLabels.map((label) => [label.nodeId, label] as const),
  );
  const evidenceByFeedItemId = new Map(
    input.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const clusterById = new Map(
    input.clusters.map((cluster) => [cluster.id, cluster] as const),
  );
  const node = (nodeId: string) => {
    const candidate = candidateByNodeId.get(nodeId);
    const label = labelByNodeId.get(nodeId);
    if (candidate === undefined || label === undefined) {
      throw new Error(`Unknown topic relation node ${nodeId}`);
    }

    return {
      nodeId,
      label: label.label ?? candidate.fallbackLabel,
      topicId: label.topicId,
      subject: label.semantic?.subject,
      claimType: label.semantic?.claimType,
      qualifier: label.semantic?.qualifier,
      parentSubject: label.semantic?.parentSubject,
      semanticConfidenceScore: label.semantic?.confidenceScore,
      summary: candidate.summary,
      evidenceSamples: buildAgentRuntimeTopicEvidenceSamples({
        candidate,
        clusterById,
        evidenceByFeedItemId,
      }),
    };
  };

  return JSON.stringify(
    {
      task: "Verify shortlisted topic relations.",
      constraints: {
        requireDecisionForEveryPair: true,
        conservativeOnUncertainty: true,
        sharedTermsAreHintsOnly: true,
      },
      pairs: input.relations.map((relation) => ({
        sourceNodeId: relation.sourceNodeId,
        targetNodeId: relation.targetNodeId,
        sharedTerms: relation.sharedTerms,
        source: node(relation.sourceNodeId),
        target: node(relation.targetNodeId),
      })),
    },
    null,
    2,
  );
};

export const agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceNodeId: { type: "string" },
          targetNodeId: { type: "string" },
          sameTopic: { type: "boolean" },
          confidenceScore: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string" },
        },
        required: [
          "sourceNodeId",
          "targetNodeId",
          "sameTopic",
          "confidenceScore",
          "rationale",
        ],
      },
    },
  },
  required: ["decisions"],
} as const satisfies Record<string, unknown>;
