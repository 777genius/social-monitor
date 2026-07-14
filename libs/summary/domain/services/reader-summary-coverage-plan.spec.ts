import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import { buildReaderSummaryCoveragePlan } from "./reader-summary-coverage-plan";

describe("buildReaderSummaryCoveragePlan", () => {
  it("selects one lead and diverse strong secondary signals", () => {
    const selection = buildSelection([
      cluster("openai", 4.2, "openai-a", ["x-twitter", "rss"]),
      cluster("openai-copy", 3.8, "openai-b", ["reddit"]),
      cluster("security", 2.1, "security-a", ["hacker-news"]),
      cluster("database", 1.7, "database-a", ["rss"]),
    ]);

    const plan = buildReaderSummaryCoveragePlan(selection);

    expect(plan.mode).toBe("daily_synthesis");
    expect(plan.lead?.clusterId).toBe("openai");
    expect(plan.secondary.map((item) => item.clusterId)).toEqual([
      "security",
      "database",
    ]);
  });

  it("does not fill secondary slots with weak clusters", () => {
    const selection = buildSelection([
      cluster("lead", 3.4, "lead-a", ["reddit"]),
      cluster("weak", 0.4, "weak-a", ["rss"]),
    ]);

    expect(buildReaderSummaryCoveragePlan(selection).secondary).toEqual([]);
  });

  it("does not force a down-ranked item into the headline when no lead is eligible", () => {
    const base = buildSelection([
      cluster("unverified", 3.8, "unverified-a", ["x-twitter"]),
    ]);
    const item = evidenceById(base, "unverified-a");
    const selection: SummaryEvidenceSelection = {
      ...base,
      selectedEvidence: [
        {
          ...item,
          contentQuality: {
            ...item.contentQuality!,
            decision: "downrank",
            needsLlmReview: true,
            reason: "Unverified viral claim",
          },
        },
      ],
    };

    expect(buildReaderSummaryCoveragePlan(selection)).toEqual({
      mode: "single_story",
      secondary: [],
    });
  });

  it("keeps secondary legal reports out of the lead without first-party evidence", () => {
    const base = buildSelection([
      cluster("legal-report", 5.2, "legal-report-a", ["reddit", "rss"]),
      cluster("engineering", 3.1, "engineering-a", ["hacker-news"]),
    ]);
    const legal = evidenceById(base, "legal-report-a");
    const engineering = evidenceById(base, "engineering-a");
    const selection: SummaryEvidenceSelection = {
      ...base,
      selectedEvidence: [
        {
          ...legal,
          title: "Reports say Acme sued Example Labs over alleged model theft",
          bodyPreview:
            "Community posts discuss the lawsuit, but no primary court filing is available.",
        },
        engineering,
      ],
    };

    const plan = buildReaderSummaryCoveragePlan(selection);

    expect(plan.lead?.clusterId).toBe("engineering");
    expect(plan.secondary.map((item) => item.clusterId)).toContain(
      "legal-report",
    );
  });

  it("allows a first-party legal filing to lead", () => {
    const base = buildSelection([
      cluster("official-filing", 5.2, "official-filing-a", ["rss"]),
      cluster("engineering", 3.1, "engineering-a", ["hacker-news"]),
    ]);
    const filing = evidenceById(base, "official-filing-a");
    const engineering = evidenceById(base, "engineering-a");
    const selection: SummaryEvidenceSelection = {
      ...base,
      selectedEvidence: [
        {
          ...filing,
          title: "Acme files lawsuit against Example Labs",
          contentQuality: {
            ...filing.contentQuality!,
            flags: ["official_account", "trusted_author"],
          },
        },
        engineering,
      ],
    };

    expect(buildReaderSummaryCoveragePlan(selection).lead?.clusterId).toBe(
      "official-filing",
    );
  });

  it("allows an explicitly classified primary court document to lead", () => {
    const base = buildSelection([
      cluster("court-filing", 5.2, "court-filing-a", ["rss"]),
      cluster("engineering", 3.1, "engineering-a", ["hacker-news"]),
    ]);
    const filing = evidenceById(base, "court-filing-a");
    const engineering = evidenceById(base, "engineering-a");
    const selection: SummaryEvidenceSelection = {
      ...base,
      selectedEvidence: [
        {
          ...filing,
          title: "Court filing records Acme lawsuit against Example Labs",
          contentQuality: {
            ...filing.contentQuality!,
            flags: ["primary_document"],
          },
        },
        engineering,
      ],
    };

    expect(buildReaderSummaryCoveragePlan(selection).lead?.clusterId).toBe(
      "court-filing",
    );
  });

  it.each([
    "Acme accuses Example Labs of trade-secret misappropriation",
    "Acme files a complaint alleging model theft",
    "Regulators bring an antitrust case against Example Labs",
  ])("keeps a secondary legal allegation out of the lead: %s", (title) => {
    const base = buildSelection([
      cluster("legal-report", 5.2, "legal-report-a", ["rss"]),
      cluster("engineering", 3.1, "engineering-a", ["hacker-news"]),
    ]);
    const legal = evidenceById(base, "legal-report-a");
    const engineering = evidenceById(base, "engineering-a");

    expect(
      buildReaderSummaryCoveragePlan({
        ...base,
        selectedEvidence: [
          {
            ...legal,
            title,
            bodyPreview: "A secondary publication reports the claim.",
          },
          engineering,
        ],
      }).lead?.clusterId,
    ).toBe("engineering");
  });

  it("recognizes an eligible official court document without an enrichment flag", () => {
    const base = buildSelection([
      cluster("court-order", 5.2, "court-order-a", ["rss"]),
      cluster("engineering", 3.1, "engineering-a", ["hacker-news"]),
    ]);
    const filing = evidenceById(base, "court-order-a");
    const engineering = evidenceById(base, "engineering-a");

    expect(
      buildReaderSummaryCoveragePlan({
        ...base,
        selectedEvidence: [
          {
            ...filing,
            canonicalUrl: "https://example.uscourts.gov/cases/order-42.pdf",
            title: "Court order in civil action No. 42",
          },
          engineering,
        ],
      }).lead?.clusterId,
    ).toBe("court-order");
  });

  it("keeps GitHub-only clusters out when social or news coverage exists", () => {
    const selection = buildSelection([
      cluster("github-trend", 8.4, "github-a", ["github-trending-page"]),
      cluster("social-lead", 3.4, "social-a", ["reddit", "rss"]),
      cluster("news-secondary", 1.8, "news-a", ["hacker-news"]),
    ]);

    const plan = buildReaderSummaryCoveragePlan(selection);

    expect(plan.lead?.clusterId).toBe("social-lead");
    expect(plan.secondary.map((item) => item.clusterId)).toEqual([
      "news-secondary",
    ]);
  });

  it("prefers a highly engaged relevant discussion over a marginally higher down-ranked launch", () => {
    const antCluster = {
      ...cluster("ant", 2.65, "ant-hn", ["hacker-news", "rss"]),
      duplicateFeedItemIds: ["ant-rss"],
      signalBreakdown: {
        baseScore: 2.023,
        crossProviderSupport: 0.257,
        sameProviderSupport: 0,
        providerDiversityBoost: 0.25,
        interestDiversityBoost: 0,
        freshnessBoost: 0.12,
        totalScore: 2.65,
      },
    } satisfies StoryCluster;
    const usageCluster = {
      ...cluster("usage-limits", 2.625, "usage-x", ["x-twitter"]),
      signalBreakdown: {
        baseScore: 2.505,
        crossProviderSupport: 0,
        sameProviderSupport: 0,
        providerDiversityBoost: 0,
        interestDiversityBoost: 0,
        freshnessBoost: 0.12,
        totalScore: 2.625,
      },
    } satisfies StoryCluster;
    const base = buildSelection([antCluster, usageCluster]);
    const antHn = evidenceById(base, "ant-hn");
    const usageX = evidenceById(base, "usage-x");
    const selection: SummaryEvidenceSelection = {
      ...base,
      selectedEvidence: [
        {
          ...antHn,
          title: "Show HN: Ant JavaScript ecosystem",
          canonicalUrl: "https://news.ycombinator.com/item?id=123",
          sourceOriginUrl: "https://ant.example/",
          providerMetricLabels: [
            { label: "Points", value: "155" },
            { label: "Comments", value: "67" },
          ],
          contentQuality: {
            ...antHn.contentQuality!,
            qualityScore: 0.55,
            decision: "downrank",
            flags: ["missing_topic_context"],
            reason: "Early launch lacks broader topic context",
          },
        },
        {
          ...antHn,
          feedItemId: "ant-rss",
          sourceItemId: "ant-rss",
          providerKey: "rss",
          canonicalUrl: "https://ant.example/",
          score: 1.71,
          providerMetricLabels: [],
          contentQuality: {
            ...antHn.contentQuality!,
            qualityScore: 0.55,
            decision: "downrank",
            flags: ["missing_topic_context"],
            reason: "Same early launch publication",
          },
        },
        {
          ...usageX,
          title: "Agent-heavy usage is stressing product limits",
          providerMetricLabels: [
            { label: "Likes", value: "7,821" },
            { label: "Reposts", value: "410" },
            { label: "Replies", value: "1,139" },
          ],
          contentQuality: {
            ...usageX.contentQuality!,
            qualityScore: 0.9,
            interestRelevanceScore: 0.95,
          },
        },
      ],
    };

    const plan = buildReaderSummaryCoveragePlan(selection);

    expect(plan.lead?.clusterId).toBe("usage-limits");
    expect(plan.secondary.map((item) => item.clusterId)).toContain("ant");
  });

  it("prefers an independent secondary topic inside the quality threshold", () => {
    const selection = buildSelection([
      cluster("lead", 4, "openai-a", ["reddit"]),
      cluster("same-provider", 3, "openai-cost", ["reddit"]),
      cluster("independent", 2.9, "security-a", ["hacker-news"]),
    ]);

    const plan = buildReaderSummaryCoveragePlan(selection);

    expect(plan.secondary[0]?.clusterId).toBe("independent");
  });

  it("does not let one viral first-party HN item displace a similarly strong cross-source story", () => {
    const clawk = {
      ...cluster("clawk", 2.284, "clawk-hn", ["hacker-news"]),
      signalBreakdown: {
        baseScore: 2.164,
        crossProviderSupport: 0,
        sameProviderSupport: 0,
        providerDiversityBoost: 0,
        interestDiversityBoost: 0,
        freshnessBoost: 0.12,
        totalScore: 2.284,
      },
    } satisfies StoryCluster;
    const broaderStory = {
      ...cluster("localized-pricing", 2.366, "pricing-reddit", [
        "reddit",
        "rss",
      ]),
      duplicateFeedItemIds: ["pricing-rss"],
      signalBreakdown: {
        baseScore: 1.839,
        crossProviderSupport: 0.257,
        sameProviderSupport: 0,
        providerDiversityBoost: 0.15,
        interestDiversityBoost: 0,
        freshnessBoost: 0.12,
        totalScore: 2.366,
      },
    } satisfies StoryCluster;
    const base = buildSelection([clawk, broaderStory]);
    const clawkEvidence = evidenceById(base, "clawk-hn");
    const pricingReddit = evidenceById(base, "pricing-reddit");
    const selection: SummaryEvidenceSelection = {
      ...base,
      selectedEvidence: [
        {
          ...clawkEvidence,
          title:
            "Show HN: Clawk - Give coding agents a disposable Linux VM, not your laptop",
          sourceOriginUrl: "https://github.com/clawkwork/clawk",
          providerMetricLabels: [
            { label: "Points", value: "191" },
            { label: "Comments", value: "150" },
          ],
          contentQuality: {
            ...clawkEvidence.contentQuality!,
            flags: ["official_account", "trusted_author"],
          },
        },
        {
          ...pricingReddit,
          title: "Anthropic adds localized Claude pricing in India",
        },
        {
          ...pricingReddit,
          feedItemId: "pricing-rss",
          sourceItemId: "pricing-rss",
          providerKey: "rss",
          canonicalUrl: "https://example.news/claude-india-pricing",
          title: "Claude launches localized subscription pricing in India",
        },
      ],
    };

    const plan = buildReaderSummaryCoveragePlan(selection);

    expect(plan.lead?.clusterId).toBe("localized-pricing");
    expect(plan.mode).toBe("daily_synthesis");
    expect(plan.secondary.map((item) => item.clusterId)).toContain("clawk");
  });

  it("keeps a single-source first-party lead when its signal is materially stronger", () => {
    const official = {
      ...cluster("official-launch", 4.5, "official-hn", ["hacker-news"]),
      signalBreakdown: {
        baseScore: 4.38,
        crossProviderSupport: 0,
        sameProviderSupport: 0,
        providerDiversityBoost: 0,
        interestDiversityBoost: 0,
        freshnessBoost: 0.12,
        totalScore: 4.5,
      },
    } satisfies StoryCluster;
    const confirmed = {
      ...cluster("confirmed-story", 3, "confirmed-reddit", ["reddit", "rss"]),
      duplicateFeedItemIds: ["confirmed-rss"],
    } satisfies StoryCluster;
    const base = buildSelection([official, confirmed]);
    const officialEvidence = evidenceById(base, "official-hn");
    const confirmedReddit = evidenceById(base, "confirmed-reddit");

    const plan = buildReaderSummaryCoveragePlan({
      ...base,
      selectedEvidence: [
        {
          ...officialEvidence,
          title: "Show HN: Major first-party coding agent release",
          providerMetricLabels: [{ label: "Points", value: "1200" }],
          contentQuality: {
            ...officialEvidence.contentQuality!,
            flags: ["official_account", "trusted_author"],
          },
        },
        confirmedReddit,
        {
          ...confirmedReddit,
          feedItemId: "confirmed-rss",
          sourceItemId: "confirmed-rss",
          providerKey: "rss",
          canonicalUrl: "https://example.news/confirmed-story",
        },
      ],
    });

    expect(plan.lead?.clusterId).toBe("official-launch");
    expect(plan.mode).toBe("single_story");
    expect(plan.secondary.map((item) => item.clusterId)).toContain(
      "confirmed-story",
    );
  });

  it("uses a daily synthesis for several strong unrelated Jul 12-like signals", () => {
    const selection = buildSelection([
      cluster("model-routing", 2.45, "openai-routing", ["x-twitter"]),
      cluster("token-overhead", 2.25, "security-tokens", ["hacker-news"]),
      cluster("research-careers", 2.05, "database-research", ["rss"]),
    ]);

    const plan = buildReaderSummaryCoveragePlan(selection);

    expect(plan.mode).toBe("daily_synthesis");
    expect(plan.lead).toBeDefined();
    expect(plan.secondary).toHaveLength(2);
  });

  it("does not label several stories from one provider as a cross-provider synthesis", () => {
    const selection = buildSelection([
      cluster("model-routing", 2.45, "openai-routing", ["reddit"]),
      cluster("token-overhead", 2.25, "security-tokens", ["reddit"]),
    ]);

    expect(buildReaderSummaryCoveragePlan(selection).mode).toBe("single_story");
  });
});

const buildSelection = (
  clusters: readonly StoryCluster[],
): SummaryEvidenceSelection => {
  const selectedEvidence = clusters.map((item): SummaryEvidenceItem => ({
    feedItemId: item.representativeFeedItemId,
    sourceItemId: item.representativeFeedItemId,
    sourceBindingId: `binding-${item.representativeFeedItemId}`,
    interestId: item.id,
    providerKey: item.providerKeys[0] ?? "rss",
    canonicalUrl: `https://example.test/${item.representativeFeedItemId}`,
    title: titleFor(item.representativeFeedItemId),
    bodyPreview: `${titleFor(item.representativeFeedItemId)} detailed context`,
    publishedAt: new Date("2026-07-09T12:00:00.000Z"),
    observedAt: new Date("2026-07-09T12:05:00.000Z"),
    score: item.score,
    whyImportant: ["Relevant today"],
    contentQuality: {
      qualityScore: 0.8,
      interestRelevanceScore: 0.8,
      engagementIntegrityScore: 0.8,
      eligibleForSummary: true,
      eligibleForTopRead: true,
      needsLlmReview: false,
      decision: "eligible",
      flags: [],
      reason: "Strong signal",
    },
  }));

  return {
    rankingPolicyVersion: "test-v1",
    sourceWindow: {
      windowId: "window",
      startedAt: new Date("2026-07-09T00:00:00.000Z"),
      endedAt: new Date("2026-07-10T00:00:00.000Z"),
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: clusters.map((item) => item.id),
    },
    clusters,
    selectedEvidence,
  };
};

const cluster = (
  id: string,
  score: number,
  representativeFeedItemId: string,
  providerKeys: readonly string[],
): StoryCluster => ({
  id,
  storyKey: id,
  representativeFeedItemId,
  duplicateFeedItemIds: [],
  interestIds: [id],
  providerKeys,
  score,
  observedAtRange: {
    startedAt: new Date("2026-07-09T12:00:00.000Z"),
    endedAt: new Date("2026-07-09T12:10:00.000Z"),
  },
  whyImportant: ["Relevant today"],
});

const titleFor = (feedItemId: string): string => {
  if (feedItemId.startsWith("openai")) {
    if (feedItemId === "openai-cost") {
      return "OpenAI users debate pricing and usage limits";
    }
    return "OpenAI GPT rollout changes coding workflows";
  }
  if (feedItemId.startsWith("security")) {
    return "Security researchers publish browser isolation framework";
  }
  if (feedItemId.startsWith("database")) {
    return "PostgreSQL teams test query planning extension";
  }
  if (feedItemId.startsWith("social")) {
    return "OpenAI developers discuss agent workflow changes";
  }
  if (feedItemId.startsWith("news")) {
    return "Security teams publish a new browser isolation policy";
  }
  if (feedItemId.startsWith("github")) {
    return "GitHub project gains stars for a terminal theme";
  }
  return "Small unrelated discussion";
};

const evidenceById = (
  selection: SummaryEvidenceSelection,
  feedItemId: string,
): SummaryEvidenceItem => {
  const item = selection.selectedEvidence.find(
    (candidate) => candidate.feedItemId === feedItemId,
  );
  if (item === undefined) {
    throw new Error(`Missing test evidence ${feedItemId}`);
  }

  return item;
};
