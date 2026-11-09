import type { ReaderSummaryTopicRelationVerifierInput } from "../../ports";
import { buildAgentRuntimeReaderSummaryTopicRelationNodeProjection } from "./agent-runtime-reader-summary-topic-relation-node-evidence";

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
  const node = buildAgentRuntimeReaderSummaryTopicRelationNodeProjection(input);

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

export { agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema } from "./agent-runtime-reader-summary-topic-relation-response-schema";
