import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { buildReaderSummaryCoveragePlan } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import {
  assertNoReaderSummaryPromptReleaseOverride,
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
  currentReaderSummaryPromptRelease,
} from "./openai-responses-reader-summary-prompt";
import { openAiReaderSummaryJsonSchema } from "./openai-responses-reader-summary-schema";

describe("OpenAI reader summary prompt contract", () => {
  it("uses one meaningful provider-neutral prompt release", () => {
    expect(currentReaderSummaryPromptRelease).toMatchObject({
      id: expect.stringMatching(
        /^reader_summary\.prompt\.\d{4}-\d{2}-\d{2}\.[a-z_]+$/,
      ),
      releasedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(currentReaderSummaryPromptRelease.id).not.toMatch(/\.v\d+$/);
    expect(currentReaderSummaryPromptRelease.id).not.toMatch(
      /agent_runtime|openai/,
    );
    expect(currentReaderSummaryPromptRelease.id).toContain(
      currentReaderSummaryPromptRelease.releasedOn,
    );
    expect(
      currentReaderSummaryPromptRelease.changeSummary.trim().length,
    ).toBeGreaterThan(20);
  });

  it("rejects labels that can diverge from the compiled prompt", () => {
    expect(() =>
      assertNoReaderSummaryPromptReleaseOverride({
        environmentName: "READER_SUMMARY_PROMPT_VERSION",
        value: "reader_summary.prompt.fake_release",
      }),
    ).toThrow(
      "READER_SUMMARY_PROMPT_VERSION is no longer supported; the Reader Summary prompt release is owned by the compiled prompt contract",
    );
  });

  it("requests detailed candidate descriptions for the final top-eight ranking", () => {
    const instructions = buildOpenAiReaderSummaryInstructions({
      policy: {
        language: "auto",
        format: "executive_brief",
        tone: "analytical",
        includeRisks: true,
        includeInterestHighlights: true,
        includeRepeatedSignals: true,
        maxStories: 15,
        rulesVersion: "reader_summary.rules.policy.v1",
      },
    } as ReaderSummaryModelInput);

    expect(instructions).toContain(
      "each topStories summary 420-650 characters",
    );
    expect(instructions).toContain(
      "Keep source validation out of topStories summary prose",
    );
    expect(instructions).toContain(
      "internal workflow language such as source item",
    );
    expect(instructions).toContain(
      "never end either headline with a period or full stop",
    );
    expect(instructions).toContain(
      "Never start headline or content.headline with Reddit, Hacker News, HN, X, Twitter, RSS or GitHub Trending",
    );
    expect(instructions).toContain(
      "start with a neutral phrase such as Reports, A discussion or A first-party announcement",
    );
    expect(instructions).toContain("Do not use meta-headline formulas");
    expect(instructions).toContain(
      "Otherwise source-frame the headline as reports of, reported or alleged",
    );
    expect(instructions).toContain(
      "Never combine different story clusters into one thematic story",
    );
    expect(instructions).toContain("return 12-15 topStories");
  });

  it("allows fifteen candidates and descriptions up to 720 characters", () => {
    expect(openAiReaderSummaryJsonSchema.properties.topStories.maxItems).toBe(
      15,
    );
    expect(openAiReaderSummaryJsonSchema.$defs.topStory).toMatchObject({
      properties: {
        summary: { maxLength: 720 },
      },
    });
  });

  it("requires every claim-bearing structured surface to cite evidence", () => {
    expect(openAiReaderSummaryJsonSchema.$defs.narrativeSection).toMatchObject({
      properties: {
        citationIds: { minItems: 1, maxItems: 3 },
      },
    });
    for (const definition of [
      openAiReaderSummaryJsonSchema.$defs.topStory,
      openAiReaderSummaryJsonSchema.$defs.interestHighlight,
      openAiReaderSummaryJsonSchema.$defs.repeatedSignal,
      openAiReaderSummaryJsonSchema.$defs.readerClaim,
    ]) {
      expect(definition).toMatchObject({
        properties: { citationIds: { minItems: 1 } },
      });
    }
  });

  it("does not expose GitHub Trending evidence or coverage to the model", () => {
    const input = promptInputWithGitHubTrending();
    const payload = buildOpenAiReaderSummaryPromptPayload(input);

    expect(payload).not.toContain("github-trending-page");
    expect(payload).not.toContain("owner/private-prompt-influence");
    expect(payload).toContain("reddit-main-signal");
  });

  it("uses the coverage plan already approved by the execution use case", () => {
    const base = promptInputWithGitHubTrending();
    const input: ReaderSummaryModelInput = {
      ...base,
      coveragePlan: {
        mode: "single_story",
        lead: {
          role: "lead",
          clusterId: "approved-editorial-lead",
          score: 1,
          feedItemIds: ["feed-1"],
          providerKeys: ["reddit"],
          interestIds: ["interest-ai"],
          whyImportant: ["Approved by the shared editorial policy"],
        },
        secondary: [],
      },
    };

    const payload = JSON.parse(
      buildOpenAiReaderSummaryPromptPayload(input),
    ) as { coveragePlan: { lead: { storyClusterId: string } | null } };

    expect(payload.coveragePlan.lead?.storyClusterId).toBe(
      "approved-editorial-lead",
    );
  });

  it("tells the model to synthesize the day when the approved plan requires it", () => {
    const base = promptInputWithGitHubTrending();
    const input: ReaderSummaryModelInput = {
      ...base,
      coveragePlan: { ...base.coveragePlan, mode: "daily_synthesis" },
    };

    const instructions = buildOpenAiReaderSummaryInstructions(input);
    const payload = JSON.parse(
      buildOpenAiReaderSummaryPromptPayload(input),
    ) as { coveragePlan: { mode: string } };

    expect(instructions).toContain(
      "Write a thematic daily digest, not an article about one source item",
    );
    expect(instructions).toContain(
      "set storyClusterId to null, and cite 2-3 planned citations",
    );
    expect(payload.coveragePlan.mode).toBe("daily_synthesis");
  });
});

const promptInputWithGitHubTrending = (): ReaderSummaryModelInput => {
  const selectedEvidence = [
    promptEvidence("github-trending-page", "owner/private-prompt-influence", 2),
    promptEvidence("reddit", "reddit-main-signal", 1),
  ];
  const clusters = selectedEvidence.map((item) => ({
    id: `cluster-${item.feedItemId}`,
    storyKey: `story-${item.feedItemId}`,
    representativeFeedItemId: item.feedItemId,
    duplicateFeedItemIds: [],
    interestIds: [item.interestId],
    providerKeys: [item.providerKey],
    score: item.score,
    observedAtRange: { startedAt: item.observedAt, endedAt: item.observedAt },
    whyImportant: item.whyImportant,
  }));
  const evidence = {
    rankingPolicyVersion: "story_ranking_test",
    sourceWindow: {
      windowId: "window-test",
      startedAt: new Date("2026-07-10T00:00:00.000Z"),
      endedAt: new Date("2026-07-11T00:00:00.000Z"),
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: clusters.map((cluster) => cluster.id),
    },
    clusters,
    selectedEvidence,
  };

  return {
    tenantId: tenantId("tenant-prompt"),
    workspaceId: workspaceId("workspace-prompt"),
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt: new Date("2026-07-10T00:00:00.000Z"),
      endedAt: new Date("2026-07-11T00:00:00.000Z"),
      timezone: "UTC",
      periodKey: "daily:2026-07-10:UTC",
    },
    evidence,
    coveragePlan: buildReaderSummaryCoveragePlan(evidence),
    contextArtifacts: [],
    policy: {
      language: "auto",
      format: "executive_brief",
      tone: "analytical",
      maxStories: 10,
      includeRisks: true,
      includeInterestHighlights: true,
      includeRepeatedSignals: true,
      dedupeStrategy: "canonical_url_then_title",
      rulesVersion: "reader_summary.rules.test",
    },
    requestedAt: new Date("2026-07-11T00:00:01.000Z"),
  };
};

const promptEvidence = (
  providerKey: string,
  title: string,
  index: number,
): ReaderSummaryModelInput["evidence"]["selectedEvidence"][number] => ({
  feedItemId: `feed-${index}`,
  sourceItemId: `source-${index}`,
  sourceBindingId: `binding-${providerKey}`,
  interestId: "interest-ai",
  providerKey,
  canonicalUrl: `https://example.test/${index}`,
  title,
  bodyPreview: `${title} body`,
  publishedAt: new Date("2026-07-10T12:00:00.000Z"),
  observedAt: new Date("2026-07-10T12:01:00.000Z"),
  score: 2,
  whyImportant: [title],
});
