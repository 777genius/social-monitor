import {
  evaluateGitHubProjection,
  githubBoardArtifact,
  githubProjectionInput,
  githubProjectionItem,
} from "./reader-summary-github-projection-policy.spec-support";

describe("reader summary GitHub canonical board", () => {
  it("accepts Watch only in canonical Top 10 rank order", () => {
    const items = githubProjectionInput().map((item) =>
      item.rank === 1 || item.rank === 3
        ? { ...item, starsGained: 1_001 }
        : item,
    );

    const evaluation = evaluateGitHubProjection(
      githubBoardArtifact({
        watchRanks: [1, 3],
        watchStarsGained: 1_001,
      }),
      items,
    );

    expect(evaluation.findings).toEqual([]);
    expect(evaluation.audit.status).toBe("verified");
  });

  it("rejects reversed and duplicate Watch citations", () => {
    const items = githubProjectionInput().map((item) =>
      item.rank === 1 || item.rank === 3
        ? { ...item, starsGained: 1_001 }
        : item,
    );
    const reversed = evaluateGitHubProjection(
      githubBoardArtifact({
        watchRanks: [3, 1],
        watchStarsGained: 1_001,
      }),
      items,
    );
    const duplicate = evaluateGitHubProjection(
      githubBoardArtifact({
        watchRanks: [1, 1],
        watchStarsGained: 1_001,
      }),
      items,
    );

    expect(reversed.audit.status).toBe("rejected");
    expect(reversed.audit.violationCodes).toContain(
      "github_projection_identity_invalid",
    );
    expect(duplicate.audit.status).toBe("rejected");
    expect(duplicate.audit.violationCodes).toContain("github_projection_mixed");
  });

  it("rejects forged and reversed visible Watch text with canonical citations", () => {
    const items = githubProjectionInput().map((item) =>
      item.rank === 1 || item.rank === 3
        ? { ...item, starsGained: 1_001 }
        : item,
    );
    const reversedText = evaluateGitHubProjection(
      githubBoardArtifact({
        watchRanks: [1, 3],
        watchStarsGained: 1_001,
        watchText: [
          "- **owner/repo-3** (#3): +1,001 stars today.",
          "- **owner/repo-1** (#1): +1,001 stars today.",
        ].join("\n"),
      }),
      items,
    );
    const forgedText = evaluateGitHubProjection(
      githubBoardArtifact({
        watchRanks: [1, 3],
        watchStarsGained: 1_001,
        watchText: [
          "- **attacker/forged-repository** (#1): +99,999 stars today.",
          "- **owner/repo-3** (#2): +1,001 stars today.",
        ].join("\n"),
      }),
      items,
    );

    expect(reversedText.audit.status).toBe("rejected");
    expect(reversedText.audit.violationCodes).toContain(
      "github_projection_identity_invalid",
    );
    expect(forgedText.audit.status).toBe("rejected");
    expect(forgedText.audit.violationCodes).toContain(
      "github_projection_identity_invalid",
    );
  });

  it("rejects rank 11 from both the displayed board and Watch", () => {
    const itemAtRankEleven = githubProjectionItem(11, {
      starsGained: 50_000,
    });
    const projectionWithRankEleven = evaluateGitHubProjection(
      githubBoardArtifact(),
      [...githubProjectionInput(), itemAtRankEleven],
    );
    const watchAtRankEleven = evaluateGitHubProjection(
      githubBoardArtifact({
        watchRank: 11,
        watchStarsGained: 50_000,
      }),
      [...githubProjectionInput(), itemAtRankEleven],
    );

    expect(projectionWithRankEleven.audit.status).toBe("rejected");
    expect(projectionWithRankEleven.audit.violationCodes).toContain(
      "github_projection_gapped",
    );
    expect(watchAtRankEleven.audit.status).toBe("rejected");
  });

  it("rejects more than three or more than one Watch section", () => {
    const items = githubProjectionInput().map((item) =>
      (item.rank ?? 0) <= 4 ? { ...item, starsGained: 1_001 } : item,
    );
    const tooMany = evaluateGitHubProjection(
      githubBoardArtifact({
        watchRanks: [1, 2, 3, 4],
        watchStarsGained: 1_001,
      }),
      items,
    );
    const duplicateSection = evaluateGitHubProjection(
      githubBoardArtifact({
        watchRanks: [1, 2, 3],
        watchStarsGained: 1_001,
        duplicateWatchSection: true,
      }),
      items,
    );

    expect(tooMany.audit.status).toBe("rejected");
    expect(duplicateSection.audit.status).toBe("rejected");
    expect(duplicateSection.audit.violationCodes).toContain(
      "github_projection_mixed",
    );
  });

  it("rejects a canonical Watch id backed by out-of-board evidence", () => {
    const evaluation = evaluateGitHubProjection(
      githubBoardArtifact({ nonGitHubWatchSection: true }),
      githubProjectionInput(),
    );

    expect(evaluation.audit.status).toBe("rejected");
    expect(evaluation.audit.violationCodes).toContain(
      "github_projection_mixed",
    );
  });
});
