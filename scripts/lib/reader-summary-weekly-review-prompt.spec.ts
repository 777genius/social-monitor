import {
  buildReaderSummaryWeeklyReviewPrompt,
  readerSummaryWeeklyReviewPromptCandidateLimit,
  readerSummaryWeeklyReviewInstructions,
} from "./reader-summary-weekly-review-prompt";

describe("reader summary weekly review prompt", () => {
  it("exposes model-facing selectors without internal story identities", () => {
    const prompt = buildReaderSummaryWeeklyReviewPrompt(promptFixture());

    expect(prompt.prompt).toContain(`story:${"b".repeat(64)}`);
    expect(prompt.prompt).toContain(`citation:${"c".repeat(64)}`);
    expect(prompt.prompt).not.toContain("reader_summary.weekly_story_identity.v1");
    expect(readerSummaryWeeklyReviewInstructions).toContain("selectors");
  });

  it("bounds the deterministic review cohort below canonical array limits", () => {
    const fixture = promptFixture();
    const candidates = Array.from(
      { length: readerSummaryWeeklyReviewPromptCandidateLimit + 25 },
      (_, index) => ({
        ...fixture.candidates[0]!,
        story: `story:${String(index).padStart(4, "0")}`,
      }),
    );
    const prompt = buildReaderSummaryWeeklyReviewPrompt({
      ...fixture,
      candidates,
    });
    const body = JSON.parse(prompt.prompt) as { candidates: unknown[] };

    expect(body.candidates).toHaveLength(
      readerSummaryWeeklyReviewPromptCandidateLimit,
    );
  });
});

const promptFixture = () => ({
  authority: {
    sealId: `reader_summary.weekly_certification_seal.v1:${"a".repeat(64)}`,
    sealSha256: "a".repeat(64),
    tenantId: "tenant",
    workspaceId: "workspace",
    scope: { type: "workspace" as const },
    weekStartedOn: "2026-07-20",
    weekEndedOn: "2026-07-26",
    days: [],
  },
  candidates: [{
    storyId: `reader_summary.weekly_story_identity.v1:${"b".repeat(64)}`,
    story: `story:${"b".repeat(64)}`,
    citations: [{
      selector: `citation:${"c".repeat(64)}`,
      requestedUtcDate: "2026-07-20",
      publicationId: "publication",
      publicationEvidenceIdentity: "evidence",
      publicationEvidenceSha256: "d".repeat(64),
      providerKey: "rss" as const,
      citationId: "citation",
      sourceItemId: "source",
      sourceContentHash: "e".repeat(64),
      title: "Sealed source",
      sourceText: "Sealed source body",
    }],
  }],
  outputSchema: {},
});
