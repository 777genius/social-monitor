import { projectLegacyWeeklyDocument } from "./openai-responses-reader-summary-weekly-document-projection";

describe("admitted legacy weekly document projection", () => {
  it("preserves exact field order and distinct citation arrays without modifying trusted input", () => {
    const root = Object.freeze({
      schemaVersion: "reader.summary.weekly.output.v1",
      sealId: "synthetic-seal",
      sealSha: "synthetic-digest",
      weekStartedOn: "2026-07-20",
      weekEndedOn: "2026-07-26",
      headline: "Synthetic headline",
      takeaway: "Synthetic takeaway",
      synthesis: "Synthetic synthesis",
    });
    const ids = Object.freeze(["citation-a", "citation-b"]);
    const stories = Object.freeze([{ storyId: "synthetic-story" }]);
    const sections = Object.freeze([{ storyId: "synthetic-story", kind: "lead" }]);
    const first = projectLegacyWeeklyDocument(root, ids, stories, sections);
    expect(first).toEqual(projectLegacyWeeklyDocument(root, ids, stories, sections));
    expect(Object.keys(first as object)).toEqual([
      "schemaVersion", "sealId", "sealSha", "weekStartedOn", "weekEndedOn",
      "headline", "headlineCitationIds", "takeaway", "takeawayCitationIds",
      "synthesis", "synthesisCitationIds", "stories", "sections",
    ]);
    const output = first as {
      headlineCitationIds: string[];
      takeawayCitationIds: string[];
      synthesisCitationIds: string[];
      stories: readonly unknown[];
      sections: readonly unknown[];
    };
    expect(output.headlineCitationIds).toEqual(ids);
    expect(output.takeawayCitationIds).toEqual(ids);
    expect(output.synthesisCitationIds).toEqual(ids);
    expect(output.headlineCitationIds).not.toBe(output.takeawayCitationIds);
    expect(output.headlineCitationIds).not.toBe(output.synthesisCitationIds);
    expect(output.headlineCitationIds).not.toBe(ids);
    expect(output.stories).toBe(stories);
    expect(output.sections).toBe(sections);
    expect(ids).toEqual(["citation-a", "citation-b"]);
    expect(Object.isFrozen(root)).toBe(true);
  });
});
