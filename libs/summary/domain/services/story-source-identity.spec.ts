import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { canonicalStoryKeysConflict } from "./story-cluster-membership";
import { StoryClusteringService } from "./story-clustering.service";
import { storySourceTitle } from "./story-source-identity";

const now = new Date("2026-10-22T20:00:00.000Z");

const item = (
  feedItemId: string,
  providerKey: string,
  canonicalUrl: string,
  title: string,
  overrides: Partial<SummaryEvidenceItem> = {},
): SummaryEvidenceItem => ({
  feedItemId, sourceItemId: `source-${feedItemId}`, sourceBindingId: "binding-1",
  interestId: "interest-1", providerKey, canonicalUrl, title,
  publishedAt: new Date("2026-10-22T10:00:00.000Z"),
  observedAt: new Date("2026-10-22T11:00:00.000Z"),
  score: 0, whyImportant: [], ...overrides,
});

const groups = (items: readonly SummaryEvidenceItem[]): string[][] =>
  new StoryClusteringService({ now: () => now }).cluster({
    identity: { tenantId: tenantId("tenant-1"), workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" } },
    items, limit: items.length, now,
  }).clusters.map((cluster) =>
    [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds].sort())
    .sort((left, right) => right.length - left.length || left[0]!.localeCompare(right[0]!));

const google = (id: string, title: string): SummaryEvidenceItem =>
  item(id, "rss", `https://news.google.com/rss/articles/${id}?oc=5`, title);

describe("story source identity", () => {
  it("merges one headline relayed by Google News from different publishers", () => {
    expect(groups([
      google("reuters", "Walmart launches tools for AI agents to shop for customers - Reuters"),
      google("herald", "Walmart launches tools for AI agents to shop for customers - Miami Herald"),
      google("other", "Barclays to cut 5,000 jobs and employ more artificial intelligence - BBC"),
    ])).toEqual([["herald", "reuters"], ["other"]]);
  });

  it("never lets one publisher confirm its own Google News headline", () => {
    expect(groups([
      google("first", "Walmart launches tools for AI agents to shop for customers - Reuters"),
      google("second", "Walmart launches tools for AI agents to shop for customers - Reuters"),
    ])).toEqual([["first"], ["second"]]);
  });

  it("merges copied X text of other authors and one author's crosspost", () => {
    const text = "The internet is going into a LOCKDOWN. Hundreds of millions of websites";
    const x = (id: string, handle: string, link: string) => item(id, "x-twitter",
      `https://x.com/${handle}/status/${id}`, `X post by @${handle}: ${text}`,
      { bodyPreview: `${text} are at risk ${link}` });

    expect(groups([x("1", "coinbureau", "https://t.co/a"),
      x("2", "sundaypeter8110", "https://t.co/b"), x("3", "coinbureau", "https://t.co/c")]))
      .toEqual([["1", "2", "3"]]);
  });

  it("merges a short crosspost by its shared external link (2026-10-23 Sweden posts)", () => {
    const title = "Sweden's government is blocking ChatGPT and Claude on staff computers";
    const body = (link: string) => `Original Swedish article: [${link}](${link})`;
    const post = (id: string, link: string) => item(id, "reddit",
      `https://www.reddit.com/r/${id}/comments/${id}/x`, title, { bodyPreview: body(link) });

    expect(groups([post("ClaudeAI", "https://www.sverigesradio.se/artikel/chat-gpt"),
      post("ChatGPT", "https://www.sverigesradio.se/artikel/chat-gpt"),
      post("Sweden", "https://www.thelocal.se/other-article")]))
      .toEqual([["ChatGPT", "ClaudeAI"], ["Sweden"]]);
  });

  it("needs the same body too: one headline over different texts stays apart", () => {
    const title = "Claude Code now appends a link to a Claude session in commits";
    expect(groups([
      item("a", "reddit", "https://www.reddit.com/r/ClaudeAI/comments/a/x", title,
        { bodyPreview: "I noticed this in my repo today after updating, anyone else?" }),
      item("b", "reddit", "https://www.reddit.com/r/ClaudeCode/comments/b/x", title,
        { bodyPreview: "Here is how to turn it off in the settings file for your team" }),
    ])).toEqual([["a"], ["b"]]);
  });

  it.each([
    ["Daily Discussion Thread for October 22, 2026",
      "Welcome to the daily discussion thread. Please keep it civil and on topic."],
    ["Good morning everyone, what are we shipping today?",
      "Good morning everyone, drop what you are building today below and say hi."],
    ["☕️ GM! Here are the most important market events over the last 24 hours",
      "GM! Here are the most important market events over the last 24 hours"],
  ])("never merges a recurring slot headline: %s", (title, body) => {
    expect(groups([
      item("monday", "reddit", "https://www.reddit.com/r/ClaudeAI/comments/m/x", title,
        { bodyPreview: body }),
      item("tuesday", "reddit", "https://www.reddit.com/r/ClaudeAI/comments/t/x", title,
        { bodyPreview: body }),
    ])).toEqual([["monday"], ["tuesday"]]);
  });

  it("needs copied text for two X authors, a paraphrase is not enough", () => {
    // Real 2026-10-22 posts that shared only generic aliases (mcp, ai-agent,
    // release-event) and were merged by the token rules.
    expect(groups([
      item("mlx", "x-twitter", "https://x.com/actuallyisaak/status/1",
        "X post by @ActuallyIsaak: Introducing MLX-LM-LoRA v5.9.0 This brings LoRA training to MCP agents with Claude and Codex",
        { bodyPreview: "Introducing MLX-LM-LoRA v5.9.0 for MCP AI agents, Claude and Codex release" }),
      item("walmart", "x-twitter", "https://x.com/techmeme/status/2",
        "X post by @Techmeme: Walmart unveils its Agent Gateway, a new MCP server to help approved AI agents shop",
        { bodyPreview: "Walmart unveils Agent Gateway MCP server release for AI agents" }),
    ])).toEqual([["mlx"], ["walmart"]]);
  });

  it("merges a paraphrased headline of two Google News publishers", () => {
    expect(groups([
      google("hg", "Anthropic, Hg to launch European AI consultancy as firms expand enterprise push - Reuters"),
      google("ft", "Anthropic strikes deal with Hg to launch European AI consultancy - Financial Times"),
    ])).toEqual([["ft", "hg"]]);
  });

  it("keeps two articles of one ordinary site apart", () => {
    expect(groups([
      item("a", "rss", "https://techcrunch.com/2026/10/22/openai-raise", "OpenAI raises $30B at $1.25T valuation"),
      item("b", "rss", "https://techcrunch.com/2026/10/22/openai-raise-update", "OpenAI raises $30B at $1.25T valuation"),
    ])).toEqual([["a"], ["b"]]);
    expect(canonicalStoryKeysConflict("url:techcrunch.com/a", "url:techcrunch.com/b")).toBe(true);
    expect(canonicalStoryKeysConflict("url:x.com/a/status/1", "url:x.com/b/status/2")).toBe(false);
    expect(canonicalStoryKeysConflict("url:news.google.com/rss/articles/a",
      "url:news.google.com/rss/articles/b")).toBe(false);
  });

  it("drops the Google News publisher suffix only for aggregator links", () => {
    expect(storySourceTitle({ canonicalUrl: "https://news.google.com/rss/articles/x",
      title: "Chips tighten - Reuters" })).toBe("Chips tighten");
    expect(storySourceTitle({ canonicalUrl: "https://example.com/a",
      title: "Chips tighten - Reuters" })).toBe("Chips tighten - Reuters");
  });
});
