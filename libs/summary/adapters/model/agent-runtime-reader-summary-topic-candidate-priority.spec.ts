import { rankUniqueAgentRuntimeTopicCandidates } from "./agent-runtime-reader-summary-topic-candidate-priority";
import { topicIntegrityFixture } from "./agent-runtime-reader-summary-topic-integrity.spec-support";

describe("topic candidate priority and identity policy", () => {
  it("honors authoritative cluster rank before deduplicating repeated node identities", () => {
    const fixture = topicIntegrityFixture(["Nimbus", "Cobalt", "Juniper"]);
    const clusters = fixture.params.clusters.map((cluster, index) => ({
      ...cluster,
      score: index === 2 ? 8 : cluster.score,
    }));
    const first = fixture.candidates[0]!;
    const last = fixture.candidates[2]!;
    const ranked = rankUniqueAgentRuntimeTopicCandidates({
      candidates: [first, last, first, fixture.candidates[1]!],
      clusters,
    });

    expect(ranked.map((candidate) => candidate.nodeId)).toEqual([
      last.nodeId, first.nodeId, fixture.candidates[1]!.nodeId,
    ]);
    expect(ranked.filter((candidate) => candidate.nodeId === first.nodeId)).toHaveLength(1);
  });

  it("uses lexical node identity for stable same-cluster-score ties", () => {
    const fixture = topicIntegrityFixture(["Nimbus", "Cobalt", "Juniper"]);
    const clusters = fixture.params.clusters.map((cluster) => ({ ...cluster, score: 1 }));
    const ranked = rankUniqueAgentRuntimeTopicCandidates({
      candidates: fixture.candidates.slice().reverse(),
      clusters,
    });
    expect(ranked.map((candidate) => candidate.nodeId)).toEqual(
      fixture.candidates.map((candidate) => candidate.nodeId),
    );
  });

  it("falls back to candidate score when a cluster is absent", () => {
    const fixture = topicIntegrityFixture(["Nimbus", "Cobalt"]);
    const unknown = {
      ...fixture.candidates[1]!,
      storyClusterId: "story:not-in-cluster-list",
      score: 9,
    };
    const ranked = rankUniqueAgentRuntimeTopicCandidates({
      candidates: [fixture.candidates[0]!, unknown],
      clusters: fixture.params.clusters,
    });
    expect(ranked[0]).toBe(unknown);
  });

  it("does not mutate frozen input arrays or original candidate records", () => {
    const fixture = topicIntegrityFixture(["Nimbus", "Cobalt"]);
    const candidates = Object.freeze(fixture.candidates.slice().reverse());
    const clusters = Object.freeze(fixture.params.clusters.slice());
    const before = candidates.map((candidate) => candidate.nodeId);

    const ranked = rankUniqueAgentRuntimeTopicCandidates({ candidates, clusters });
    expect(candidates.map((candidate) => candidate.nodeId)).toEqual(before);
    expect(ranked.map((candidate) => candidate.nodeId)).toEqual(
      fixture.candidates.map((candidate) => candidate.nodeId),
    );
  });
});
