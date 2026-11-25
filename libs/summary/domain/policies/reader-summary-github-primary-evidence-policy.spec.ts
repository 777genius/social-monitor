import type {
  ReaderSummaryArtifact,
  ReaderSummaryContent,
} from "../entities/reader-summary-artifact";
import {
  readerSummaryHasVerifiedGitHubProjection,
} from "./reader-summary-github-projection-policy";
import {
  evaluateGitHubProjection,
  githubBoardArtifact,
  githubProjectionInput,
  githubReaderItem,
} from "./reader-summary-github-projection-policy.spec-support";

describe("reader summary GitHub primary evidence policy", () => {
  it("accepts literal GitHub editorial language when non-GitHub evidence supports it", () => {
    const artifact = githubBoardArtifact();
    const evaluation = evaluateGitHubProjection(
      artifact,
      githubProjectionInput(),
    );

    expect(artifact.toSnapshot().headline).toContain("GitHub");
    expect(artifact.toSnapshot().content?.bullets[0]).toContain("GitHub");
    expect(evaluation.audit.status).toBe("verified");
  });

  it.each(primaryGitHubSurfaceCases())(
    "rejects GitHub provider or citation evidence in primary %s",
    (_surface, mutateContent) => {
      const validArtifact = githubBoardArtifact();
      const validEvaluation = evaluateGitHubProjection(
        validArtifact,
        githubProjectionInput(),
      );
      const forgedArtifact = withForgedContent(mutateContent);
      const evaluation = evaluateGitHubProjection(
        forgedArtifact,
        githubProjectionInput(),
      );

      expect(evaluation.audit.violationCodes).toContain(
        "github_projection_mixed",
      );
      expect(
        readerSummaryHasVerifiedGitHubProjection({
          artifact: forgedArtifact,
          audit: validEvaluation.audit,
        }),
      ).toBe(false);
    },
  );
});

type ContentMutation = (content: ReaderSummaryContent) => ReaderSummaryContent;

function primaryGitHubSurfaceCases(): readonly (readonly [
  string,
  ContentMutation,
])[] {
  return [
  [
    "source mix",
    (content) => ({
      ...content,
      sourceMix: [
        {
          providerKey: "github-trending-page",
          itemCount: 10,
          citationCount: 10,
          storyClusterCount: 0,
          crossSourceClusterCount: 0,
          singleSourceOnly: true,
          interestIds: ["interest-github"],
        },
      ],
    }),
  ],
  [
    "top reads",
    (content) => ({
      ...content,
      topReads: [
        githubReaderItem(
          1,
          "https://github.com/owner/repo-1",
          "github-citation-1",
        ),
      ],
    }),
  ],
  [
    "narrative",
    (content) => ({
      ...content,
      narrativeSections: [
        ...(content.narrativeSections ?? []),
        {
          id: "forged-github-lead",
          kind: "main_signal",
          title: "Primary GitHub signal",
          text: "The GitHub board is the primary evidence.",
          citationIds: ["github-citation-1"],
        },
      ],
    }),
  ],
  [
    "claims",
    (content) => ({
      ...content,
      claimBoard: [
        {
          claim: "GitHub momentum leads the day.",
          evidence: [
            {
              title: "owner/repo-1",
              providerKey: "github-trending-page",
              citationId: "github-citation-1",
              canonicalUrl: "https://github.com/owner/repo-1",
            },
          ],
          confidence: {
            level: "medium",
            score: 0.7,
            rationale: "The projection reports the repository rank.",
          },
          risks: [],
          citationIds: ["github-citation-1"],
        },
      ],
    }),
  ],
  [
    "topics",
    (content) => ({
      ...content,
      topicMap: {
        schemaVersion: "reader_summary.topic_map.v1",
        generatedBy: "deterministic",
        confidence: {
          level: "medium",
          score: 0.7,
          rationale: "The projection supplied a topic.",
        },
        nodes: [
          {
            id: "topic-github",
            label: "GitHub momentum",
            groupId: "group-github",
            storyClusterIds: ["forged-story"],
            popularityScore: 80,
            sizeWeight: 1,
            evidenceCount: 1,
            providerKeys: ["github-trending-page"],
            interestIds: ["interest-github"],
            citationIds: ["github-citation-1"],
            keywords: ["github"],
            rationale: "The projection supplied a topic.",
          },
        ],
        groups: [
          {
            id: "group-github",
            label: "GitHub",
            colorKey: "blue",
            nodeIds: ["topic-github"],
            confidence: {
              level: "medium",
              score: 0.7,
              rationale: "The projection supplied a topic.",
            },
          },
        ],
        edges: [],
        warnings: [],
      },
    }),
  ],
  ];
}

const withForgedContent = (
  mutateContent: ContentMutation,
): ReaderSummaryArtifact => {
  const snapshot = githubBoardArtifact().toSnapshot();
  const content = snapshot.content!;
  return {
    toSnapshot: () => ({
      ...snapshot,
      content: mutateContent(content),
    }),
  } as unknown as ReaderSummaryArtifact;
};
