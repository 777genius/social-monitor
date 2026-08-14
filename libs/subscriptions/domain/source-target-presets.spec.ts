import { StaticSourceTargetCatalogAdapter } from "../adapters/target-catalog/static-source-target-catalog.adapter";
import { aiDeveloperSignalSourcePreset } from "./source-target-presets";

describe("aiDeveloperSignalSourcePreset", () => {
  it("contains valid source targets for the subscription catalog", () => {
    const catalog = new StaticSourceTargetCatalogAdapter();

    expect(aiDeveloperSignalSourcePreset.entries).toHaveLength(4);
    for (const entry of aiDeveloperSignalSourcePreset.entries) {
      expect(
        catalog.validateTarget({
          providerKey: entry.providerKey,
          targetKind: entry.targetKind,
          targetValue: entry.targetValue,
          config: entry.targetConfig,
        }),
      ).toMatchObject({ ok: true });
    }
  });

  it("uses Reddit daily multi-pass source config for AI discussion discovery", () => {
    const redditEntry = aiDeveloperSignalSourcePreset.entries.find(
      (entry) => entry.providerKey === "reddit",
    );

    expect(redditEntry).toMatchObject({
      targetKind: "search_query",
      targetValue: "AI technology programming developer tools",
      targetConfig: {
        maxItems: 100,
        adaptivePagination: {
          enabled: true,
          targetItems: 150,
          maxPages: 4,
          minNewItemsPerPage: 2,
          maxDuplicateRate: 0.75,
        },
        sourceQueryPlanner: {
          enabled: true,
          rollout: "real_binding_canary",
          topic: expect.stringContaining("Claude Code"),
          maxLanesPerSource: 8,
          maxItemsPerLane: 35,
          includeEnrichment: true,
        },
      },
    });

    const redditConfig = redditEntry?.targetConfig as
      | {
          readonly scanPasses: readonly {
            readonly mode: "listing" | "search";
            readonly subreddit?: string;
            readonly listing?: string;
            readonly query?: string;
            readonly allowedSubreddits?: readonly string[];
          }[];
        }
      | undefined;
    const scanPasses = redditConfig?.scanPasses as readonly {
      readonly mode: "listing" | "search";
      readonly subreddit?: string;
      readonly listing?: string;
      readonly query?: string;
      readonly allowedSubreddits?: readonly string[];
    }[];

    expect(scanPasses).toHaveLength(44);
    expect(
      scanPasses
        .filter((pass) => pass.mode === "listing" && pass.listing === "new")
        .map((pass) => pass.subreddit),
    ).toEqual([
      "ArtificialInteligence",
      "OpenAI",
      "ClaudeAI",
      "ClaudeCode",
      "codex",
      "LocalLLaMA",
      "MachineLearning",
      "cybersecurity",
      "programming",
      "webdev",
      "CursorAI",
      "MCPservers",
    ]);
    expect(
      scanPasses
        .filter((pass) => pass.mode === "listing" && pass.listing === "top")
        .map((pass) => pass.subreddit),
    ).toEqual([
      "ArtificialInteligence",
      "OpenAI",
      "ClaudeAI",
      "ClaudeCode",
      "codex",
      "LocalLLaMA",
      "MachineLearning",
      "cybersecurity",
      "dartlang",
      "FlutterDev",
      "javascript",
      "node",
      "Python",
      "webdev",
      "programming",
      "technology",
      "artificial",
      "ChatGPT",
      "singularity",
      "typescript",
      "rust",
      "golang",
      "netsec",
      "CursorAI",
      "MCPservers",
      "AI_Agents",
      "LangChain",
      "OpenSourceAI",
      "vibecoding",
      "reactjs",
      "SaaS",
    ]);
    expect(scanPasses.at(-1)).toMatchObject({
      mode: "search",
      query: expect.stringContaining("Claude Code"),
      maxItems: 10,
      minScore: 5,
      allowedSubreddits: expect.arrayContaining([
        "OpenAI",
        "ClaudeAI",
        "LocalLLaMA",
        "programming",
        "ChatGPT",
        "typescript",
        "netsec",
        "CursorAI",
        "MCPservers",
        "LangChain",
      ]),
    });
  });

  it("keeps Hacker News, X and RSS discovery queries focused on developer signals", () => {
    const hackerNewsEntry = aiDeveloperSignalSourcePreset.entries.find(
      (entry) => entry.providerKey === "hacker-news",
    );
    const xEntry = aiDeveloperSignalSourcePreset.entries.find(
      (entry) => entry.providerKey === "x-twitter",
    );
    const rssUrls = aiDeveloperSignalSourcePreset.entries
      .filter((entry) => entry.providerKey === "rss")
      .map((entry) => entry.targetValue);
    const rssConfigs = aiDeveloperSignalSourcePreset.entries
      .filter((entry) => entry.providerKey === "rss")
      .map((entry) => entry.targetConfig);

    const hackerNewsConfig = hackerNewsEntry?.targetConfig as
      | {
          readonly maxItems: number;
          readonly maxItemAgeHours: number;
          readonly scanPasses: readonly {
            readonly mode: "listing" | "search";
            readonly listing?: string;
            readonly target?: "story" | "comment";
            readonly query?: string;
            readonly requiredKeywords?: readonly string[];
            readonly requiredStoryKeywords?: readonly string[];
          }[];
        }
      | undefined;
    const xConfig = xEntry?.targetConfig as
      | {
          readonly maxItems: number;
          readonly limitPerProduct: number;
          readonly minLikes: number;
          readonly adaptivePagination?: {
            readonly enabled: boolean;
            readonly targetItems: number;
            readonly maxPages: number;
            readonly minNewItemsPerPage: number;
            readonly maxDuplicateRate: number;
          };
          readonly searchQueries: readonly string[];
        }
      | undefined;

    expect(hackerNewsEntry).toMatchObject({
      targetKind: "search_query",
      targetValue: "AI developer Hacker News discovery",
    });
    expect(hackerNewsConfig?.maxItems).toBe(100);
    expect(hackerNewsConfig?.maxItemAgeHours).toBe(48);
    expect(hackerNewsConfig?.scanPasses).toHaveLength(28);
    expect(hackerNewsConfig?.scanPasses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: "listing", listing: "top" }),
        expect.objectContaining({
          mode: "listing",
          listing: "ask",
          requiredKeywords: expect.arrayContaining(["ai", "developer"]),
        }),
        expect.objectContaining({
          mode: "search",
          target: "story",
          query: "model context protocol",
        }),
        expect.objectContaining({
          mode: "search",
          target: "comment",
          query: "model context protocol",
          requiredStoryKeywords: expect.arrayContaining([
            "ai",
            "developer tools",
            "code",
            "server",
          ]),
        }),
      ]),
    );
    expect(
      hackerNewsConfig?.scanPasses.some(
        (pass) => pass.mode === "search" && pass.query === "mcp",
      ),
    ).toBe(false);

    expect(xEntry).toMatchObject({
      targetKind: "search_query",
      targetValue: expect.stringContaining("OpenAI"),
    });
    expect(xConfig).toMatchObject({
      maxItems: 100,
      limitPerProduct: 30,
      minLikes: 3,
    });
    expect(xConfig?.adaptivePagination).toMatchObject({
      enabled: true,
      targetItems: 180,
      maxPages: 3,
      minNewItemsPerPage: 8,
      maxDuplicateRate: 0.65,
    });
    expect(xEntry?.targetConfig).toMatchObject({
      sourceQueryPlanner: {
        enabled: true,
        rollout: "real_binding_canary",
        maxLanesPerSource: 8,
        maxItemsPerLane: 35,
        includeEnrichment: false,
        maxSearchQueries: 8,
      },
    });
    expect(xConfig?.searchQueries).toEqual([
      '"Claude Code" OR "OpenAI Codex" OR Cursor OR "Cursor AI" OR "AI coding" OR "coding agent"',
      'MCP OR "MCP server" OR "model context protocol" OR "AI agent"',
      'OpenAI OR Anthropic OR Claude OR Gemini OR "AI model" OR LLM',
      'Flutter OR Dart OR TypeScript OR JavaScript OR "Node.js" OR Python OR Rust OR Go',
      'cybersecurity OR "AI security" OR "security vulnerability" OR infosec',
      'LangChain OR RAG OR "open source AI" OR "open source LLM" OR Ollama',
      '"vibe coding" OR "developer tools" OR "agentic coding" OR "AI infrastructure"',
    ]);
    expect(rssUrls).toHaveLength(1);
    expect(rssUrls[0]).toContain("when%3A1d");
    expect(rssConfigs[0]).toMatchObject({
      maxItemAgeHours: 48,
      extraFeedUrls: expect.arrayContaining([
        "https://hnrss.org/best",
        "https://hnrss.org/newest?q=Claude%20Code",
        "https://hnrss.org/newest?q=OpenAI%20Codex",
        "https://hnrss.org/newest?q=MCP",
        "https://hnrss.org/newest?q=MCP%20server",
        "https://hnrss.org/newest?q=Cursor%20AI",
        "https://hnrss.org/newest?q=developer%20tools",
        "https://hnrss.org/newest?q=LangChain%20RAG",
        "https://hnrss.org/newest?q=vibe%20coding",
        "https://hnrss.org/newest?q=open%20source%20AI",
        "https://hnrss.org/newest?q=open%20source%20LLM",
        "https://hnrss.org/newest?q=AI%20security",
        "https://hnrss.org/newest?q=security%20vulnerability",
        "https://openai.com/news/rss.xml",
        "https://github.blog/feed/",
      ]),
    });
  });
});
