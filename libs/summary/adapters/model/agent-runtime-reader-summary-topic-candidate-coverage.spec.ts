import { selectAgentRuntimeReaderSummaryTopicCandidates } from "./agent-runtime-reader-summary-topic-candidate-selection";
import { selectGroundedTopicCandidateCoverage } from "./agent-runtime-reader-summary-topic-candidate-coverage";
import { topicIntegrityFixture } from "./agent-runtime-reader-summary-topic-integrity.spec-support";

describe("agent runtime topic candidate score selection and grounded coverage", () => {
  it("short-circuits zero budget without changing any candidates", () => {
    const fixture = topicIntegrityFixture(["Nimbus", "Cobalt", "Juniper"]);
    const originalOrder = fixture.candidates.map((candidate) => candidate.nodeId);
    expect(selectAgentRuntimeReaderSummaryTopicCandidates({
      candidates: fixture.candidates, clusters: fixture.params.clusters,
    }, 0)).toEqual([]);
    expect(fixture.candidates.map((candidate) => candidate.nodeId)).toEqual(originalOrder);
  });

  it("ranks by authoritative cluster score before deduplicating candidate identities", () => {
    const fixture = topicIntegrityFixture(["Nimbus", "Cobalt", "Juniper"]);
    const clusters = fixture.params.clusters.map((cluster, index) => ({
      ...cluster, score: index === 2 ? 8 : cluster.score,
    }));
    const selected = selectAgentRuntimeReaderSummaryTopicCandidates({
      candidates: [fixture.candidates[0]!, fixture.candidates[2]!, fixture.candidates[0]!, fixture.candidates[1]!],
      clusters,
    }, 2);
    expect(selected.map((candidate) => candidate.nodeId)).toEqual([
      fixture.candidates[2]!.nodeId, fixture.candidates[0]!.nodeId,
    ]);
  });

  it("preserves ordinary top-ranked fallback when there is no grounded cohort", () => {
    const fixture = topicIntegrityFixture(["Nimbus", "Cobalt", "Juniper", "Saffron"]);
    expect(selectGroundedTopicCandidateCoverage(fixture.candidates, 3))
      .toEqual(fixture.candidates.slice(0, 3));
  });

  it("keeps grounded pairs together and caps unrelated candidates", () => {
    const names = ["Beacon", "Harbor", "Quartz", "Nimbus", "Redwood", "Cobalt", "Juniper", "Saffron"];
    const fallbacks = names.map((name, index) => index < 2 ? `Orion ${name}` : name);
    const fixture = topicIntegrityFixture(names, fallbacks);
    const selected = selectGroundedTopicCandidateCoverage(fixture.candidates, 8);
    expect(selected.map((candidate) => candidate.nodeId)).toEqual(
      fixture.candidates.slice(0, 4).map((candidate) => candidate.nodeId),
    );
  });
});
