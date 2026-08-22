import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import type {
  ReaderSummaryWeeklyModelInput,
  ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";
import {
  assessReaderSummaryWeeklyStorySynthesis,
  assertReaderSummaryWeeklyModelStoryObservationsUnique,
  hasStrictPairwiseReaderSummaryStoryIdentity,
} from "./reader-summary-story-identity-policy";

describe("hasStrictPairwiseReaderSummaryStoryIdentity", () => {
  it("accepts one eligible pair with a facet, named product, event, and strong topic overlap", () => {
    expect(
      hasStrictPairwiseReaderSummaryStoryIdentity({
        leftEvidence: [
          evidence(
            "left",
            "OpenAI releases Codex terminal sandbox controls security update",
          ),
        ],
        rightEvidence: [
          evidence(
            "right",
            "Codex release adds terminal sandbox controls security update",
          ),
        ],
      }),
    ).toBe(true);
  });

  it("requires both items in the matching pair to be eligible", () => {
    expect(
      hasStrictPairwiseReaderSummaryStoryIdentity({
        leftEvidence: [
          evidence(
            "left",
            "OpenAI releases Codex terminal sandbox controls security update",
          ),
        ],
        rightEvidence: [
          evidence(
            "right",
            "Codex release adds terminal sandbox controls security update",
            { decision: "downrank" },
          ),
        ],
      }),
    ).toBe(false);
  });

  it("does not infer identity from an exact quality reason", () => {
    const reason = "Editors supplied the same explanation for both candidates.";

    expect(
      hasStrictPairwiseReaderSummaryStoryIdentity({
        leftEvidence: [
          evidence("left", "Cursor releases a terminal security update", {
            reason,
          }),
        ],
        rightEvidence: [
          evidence("right", "Codex benchmark measures database latency", {
            reason,
          }),
        ],
      }),
    ).toBe(false);
  });

  it("does not union identity facts across different evidence items", () => {
    expect(
      hasStrictPairwiseReaderSummaryStoryIdentity({
        leftEvidence: [
          evidence("left-product", "Codex security warning for terminal use"),
          evidence(
            "left-vocabulary",
            "Teams document latency memory caching deployment workflows",
          ),
        ],
        rightEvidence: [
          evidence("right-product", "Codex security report on browser exploits"),
          evidence(
            "right-vocabulary",
            "Teams document latency memory caching deployment workflows",
          ),
        ],
      }),
    ).toBe(false);
  });

  it.each([
    [
      "coding-agent",
      "Atlas coding agent releases terminal sandbox workflow controls",
      "Beacon coding agent releases terminal sandbox workflow controls",
    ],
    [
      "MCP",
      "Atlas MCP server releases terminal sandbox workflow controls",
      "Beacon MCP server releases terminal sandbox workflow controls",
    ],
  ])(
    "does not treat shared broad %s vocabulary as a named product identity",
    (_label, leftTitle, rightTitle) => {
      expect(
        hasStrictPairwiseReaderSummaryStoryIdentity({
          leftEvidence: [evidence("left", leftTitle)],
          rightEvidence: [evidence("right", rightTitle)],
        }),
      ).toBe(false);
    },
  );

  it("requires event agreement when either item contains event terms", () => {
    expect(
      hasStrictPairwiseReaderSummaryStoryIdentity({
        leftEvidence: [
          evidence(
            "left",
            "OpenAI releases Codex terminal sandbox controls security update",
          ),
        ],
        rightEvidence: [
          evidence(
            "right",
            "Codex terminal sandbox controls security update improves isolation",
          ),
        ],
      }),
    ).toBe(false);
  });
});

describe("weekly stable story synthesis identity", () => {
  it("requires the lead story and root synthesis to carry one identity across days", () => {
    const { input, output } = weeklyStoryGraph();

    expect(
      assessReaderSummaryWeeklyStorySynthesis({ input, output }),
    ).toMatchObject({
      stableStoryIdentityIsUsed: true,
      sameDayStoryObservationsAreUnique: true,
      crossDayStoryCount: 1,
      synthesizedCrossDayStoryCount: 1,
    });
  });

  it("rejects duplicate same-story same-day observations before model work", () => {
    const { input } = weeklyStoryGraph();
    const duplicate = {
      ...input,
      observations: [
        ...input.observations,
        {
          ...input.observations[0]!,
          observationId: "observation:duplicate",
          citationIds: ["citation:duplicate"],
        },
      ],
    };

    expect(() =>
      assertReaderSummaryWeeklyModelStoryObservationsUnique(duplicate),
    ).toThrow("duplicate same-story same-day observations");
  });
});

const weeklyStoryGraph = (): Readonly<{
  input: ReaderSummaryWeeklyModelInput;
  output: ReaderSummaryWeeklyModelOutput;
}> => {
  const citations = [
    {
      citationId: "citation:one",
      observationId: "observation:one",
      storyId: "story:stable",
      observedOn: "2026-07-20",
      providerKey: "rss" as const,
      title: "Initial report",
      canonicalUrl: "https://example.test/one",
      dailyCertificationId: "daily:one",
      dailyCertificationSha: "1".repeat(64),
      sourceSha256: "2".repeat(64),
    },
    {
      citationId: "citation:two",
      observationId: "observation:two",
      storyId: "story:stable",
      observedOn: "2026-07-22",
      providerKey: "hacker-news" as const,
      title: "Follow-up report",
      canonicalUrl: "https://example.test/two",
      dailyCertificationId: "daily:two",
      dailyCertificationSha: "3".repeat(64),
      sourceSha256: "4".repeat(64),
    },
  ];
  const input = {
    stories: [{ storyId: "story:stable", label: "Stable story" }],
    observations: citations.map((citation) => ({
      observationId: citation.observationId,
      storyId: citation.storyId,
      observedOn: citation.observedOn,
      providerKey: citation.providerKey,
      text: citation.title,
      claimSupport: ["snapshot"] as const,
      citationIds: [citation.citationId],
      dailyCertificationId: citation.dailyCertificationId,
      dailyCertificationSha: citation.dailyCertificationSha,
      sourceSha256: citation.sourceSha256,
    })),
    citations,
  } as unknown as ReaderSummaryWeeklyModelInput;
  const output = {
    synthesisCitationIds: citations.map((citation) => citation.citationId),
    stories: [
      {
        storyId: "story:stable",
        headline: "Stable story stayed in view",
        summary: "Two certified days support this story.",
        status: "watch",
        observedFrom: "2026-07-20",
        observedThrough: "2026-07-22",
        citationIds: citations.map((citation) => citation.citationId),
      },
    ],
    sections: [
      {
        sectionId: "section:lead",
        storyId: "story:stable",
        kind: "lead",
        claimType: "snapshot",
        heading: "Stable story",
        text: "The same story remained relevant across certified days.",
        observedFrom: "2026-07-20",
        observedThrough: "2026-07-22",
        citationIds: citations.map((citation) => citation.citationId),
      },
    ],
  } as unknown as ReaderSummaryWeeklyModelOutput;
  return { input, output };
};

const evidence = (
  id: string,
  title: string,
  qualityOverrides: {
    readonly decision?: string;
    readonly reason?: string;
  } = {},
): SummaryEvidenceItem => ({
  feedItemId: `feed-${id}`,
  sourceItemId: `source-${id}`,
  sourceBindingId: `binding-${id}`,
  interestId: "ai-developer-tools",
  providerKey: id.startsWith("left") ? "rss" : "hacker-news",
  canonicalUrl: `https://example.test/${id}`,
  title,
  publishedAt: new Date("2026-07-15T12:00:00.000Z"),
  observedAt: new Date("2026-07-15T12:05:00.000Z"),
  score: 2.4,
  whyImportant: ["The evidence affects current developer workflows."],
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: qualityOverrides.decision ?? "eligible",
    flags: [],
    reason: qualityOverrides.reason ?? "Focused identity policy fixture.",
  },
});
