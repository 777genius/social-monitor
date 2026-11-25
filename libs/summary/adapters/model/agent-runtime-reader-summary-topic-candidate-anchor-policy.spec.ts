import { groundedCandidateTopicAnchors as admittedAnchors } from "./agent-runtime-reader-summary-topic-candidate-anchor-policy";
import {
  buildGroundedTopicCohortsForCandidates,
  groundedCandidateTopicAnchors,
} from "./agent-runtime-reader-summary-topic-grounded-cohorts";
import { topicIntegrityFixture } from "./agent-runtime-reader-summary-topic-integrity.spec-support";

describe("candidate identity vocabulary separated from cohort assembly", () => {
  it("preserves the historical direct-import anchor function", () => {
    expect(groundedCandidateTopicAnchors).toBe(admittedAnchors);
  });

  it("excludes generic model/provider vocabulary without trusting display keywords", () => {
    const { candidates } = topicIntegrityFixture(
      ["Beacon", "Harbor"],
      ["AI Models Beacon", "AI Tools Harbor"],
      [["Orion"], ["Orion"]],
    );
    expect([...admittedAnchors(candidates[0]!)]).toEqual(["beacon"]);
    expect([...admittedAnchors(candidates[1]!)]).toEqual(["harbor"]);
    expect(buildGroundedTopicCohortsForCandidates(candidates)).toEqual([]);
  });

  it("retains ordered grounded identity and stable group assignment", () => {
    const { candidates } = topicIntegrityFixture(
      ["Beacon", "Harbor", "Quartz"],
      ["Orion Beacon", "Orion Harbor", "Quartz"],
    );
    expect([...admittedAnchors(candidates[0]!)]).toEqual(["orion", "beacon"]);
    expect([...admittedAnchors(candidates[1]!)]).toEqual(["orion", "harbor"]);
    expect(buildGroundedTopicCohortsForCandidates(candidates)).toEqual([
      expect.objectContaining({
        groupId: "group:orion",
        sharedAnchor: "orion",
        nodeIds: candidates.slice(0, 2).map((candidate) => candidate.nodeId),
      }),
    ]);
  });
});
