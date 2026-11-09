import { agentRuntimeReaderSummaryTopicLabelerJsonSchema as legacyLabel } from "./agent-runtime-reader-summary-topic-labeler-prompt";
import { agentRuntimeReaderSummaryTopicLabelerJsonSchema as label } from "./agent-runtime-reader-summary-topic-labeler-response-schema";
import { agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema as legacyRelation } from "./agent-runtime-reader-summary-topic-relation-verifier-prompt";
import { agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema as relation } from "./agent-runtime-reader-summary-topic-relation-response-schema";

describe("topic agent runtime response contracts", () => {
  it("keeps the original labeler schema export, keys and strictness", () => {
    expect(legacyLabel).toBe(label);
    expect(label.additionalProperties).toBe(false);
    expect(label.required).toEqual(["nodeLabels", "groups"]);
    expect(label.properties.nodeLabels.items.required).toEqual([
      "nodeId", "subject", "parentSubject", "claimType",
      "confidenceScore", "groupId", "keywords",
    ]);
    expect(label.properties.nodeLabels.items.properties.groupId.pattern)
      .toBe("^group:[a-z0-9]+(?:-[a-z0-9]+)*$");
    expect(label.properties.groups.items.required).toEqual([
      "id", "label", "semanticAnchors", "nodeIds", "confidenceScore",
    ]);
  });

  it("keeps the relation verifier's strict decision schema and old export", () => {
    expect(legacyRelation).toBe(relation);
    expect(relation.additionalProperties).toBe(false);
    expect(relation.required).toEqual(["decisions"]);
    expect(relation.properties.decisions.items.additionalProperties).toBe(false);
    expect(relation.properties.decisions.items.required).toEqual([
      "sourceNodeId", "targetNodeId", "sameTopic", "confidenceScore", "rationale",
    ]);
    expect(relation.properties.decisions.items.properties.sameTopic.type).toBe("boolean");
    expect(relation.properties.decisions.items.properties.confidenceScore)
      .toEqual({ type: "number", minimum: 0, maximum: 1 });
  });
});
