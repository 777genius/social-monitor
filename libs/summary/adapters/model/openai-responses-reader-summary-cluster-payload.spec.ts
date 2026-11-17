import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import {
  projectAdditionalReaderSummaryStoryCluster,
  projectPrimaryReaderSummaryStoryCluster,
} from "./openai-responses-reader-summary-cluster-payload";
import { buildOpenAiReaderSummaryPromptPayload } from "./openai-responses-reader-summary-prompt";

describe("reader summary story-cluster prompt projection", () => {
  it("preserves the primary trusted observation window and exact legacy key order", () => {
    const input = readerSummaryInput();
    const cluster = input.evidence.clusters[0];
    if (cluster === undefined) throw new Error("Fixture must contain a story cluster");
    const frozen = JSON.stringify(cluster);

    const projected = projectPrimaryReaderSummaryStoryCluster(cluster);
    expect(Object.keys(projected)).toEqual([
      "id", "storyKey", "representativeFeedItemId", "duplicateFeedItemIds",
      "interestIds", "providerKeys", "score", "observedAtRange", "whyImportant",
    ]);
    expect(projected.observedAtRange).toEqual({
      startedAt: cluster.observedAtRange.startedAt.toISOString(),
      endedAt: cluster.observedAtRange.endedAt.toISOString(),
    });
    const payload = JSON.parse(buildOpenAiReaderSummaryPromptPayload(input)) as {
      storyClusters: unknown[];
    };
    expect(payload.storyClusters).toEqual([projected]);
    expect(JSON.stringify(cluster)).toBe(frozen);
  });

  it("keeps additional context shape separate without leaking an observation window", () => {
    const input = readerSummaryInput();
    const cluster = input.evidence.clusters[0];
    if (cluster === undefined) throw new Error("Fixture must contain a story cluster");
    const frozen = JSON.stringify(cluster);

    const projected = projectAdditionalReaderSummaryStoryCluster(cluster);
    expect(Object.keys(projected)).toEqual([
      "id", "storyKey", "representativeFeedItemId", "duplicateFeedItemIds",
      "interestIds", "providerKeys", "score", "whyImportant",
    ]);
    expect("observedAtRange" in projected).toBe(false);
    expect(projected.id).toBe(cluster.id);
    expect(projected.duplicateFeedItemIds).toEqual(cluster.duplicateFeedItemIds);
    expect(projected.whyImportant).toEqual(cluster.whyImportant);
    expect(JSON.stringify(cluster)).toBe(frozen);
  });
});
