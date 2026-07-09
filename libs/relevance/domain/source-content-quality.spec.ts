import { SourceContentQualityPolicy } from "./source-content-quality";

describe("SourceContentQualityPolicy", () => {
  const policy = new SourceContentQualityPolicy();

  it("rejects crypto promo engagement-bait X posts even when they contain AI words", () => {
    const verdict = policy.evaluate({
      providerKey: "x-twitter",
      authorHandle: "Def_Rambo",
      title:
        "I have been watching the AI space on BingX. Drop your top 3 projects.",
      bodyPreview:
        "I have been watching the AI space on BingX. Drop your top 3 projects. #AI #Crypto #Tech",
      canonicalUrl: "https://x.com/Def_Rambo/status/2070724979251941651",
      providerMetadata: {
        kind: "x_post",
        searchQuery: "OpenAI",
        likes: 83,
        reposts: 58,
        replies: 26,
      },
    });

    expect(verdict.decision).toBe("reject");
    expect(verdict.eligibleForSummary).toBe(false);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(false);
    expect(verdict.flags).toEqual(
      expect.arrayContaining([
        "crypto_promo",
        "engagement_bait",
        "weak_topic_match",
      ]),
    );
  });

  it("keeps official t.co-only X posts out of summaries until link context is hydrated", () => {
    const verdict = policy.evaluate({
      providerKey: "x-twitter",
      authorHandle: "NVIDIAAI",
      title: "https://t.co/yQHkkbmVeR",
      bodyPreview: "https://t.co/yQHkkbmVeR",
      canonicalUrl: "https://x.com/NVIDIAAI/status/2070654232139833720",
      providerMetadata: {
        kind: "x_post",
        searchQuery: "OpenAI",
        likes: 296,
        reposts: 35,
        replies: 14,
      },
    });

    expect(verdict.decision).toBe("needs_context");
    expect(verdict.eligibleForSummary).toBe(false);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(true);
    expect(verdict.flags).toEqual(
      expect.arrayContaining([
        "official_account",
        "tco_only",
        "url_only",
        "needs_link_context",
      ]),
    );
  });

  it("rejects paid-course giveaway X posts even with high engagement", () => {
    const verdict = policy.evaluate({
      providerKey: "x-twitter",
      authorHandle: "expertwith_AI",
      title: "All Paid Courses Free for First 4500 People",
      bodyPreview:
        "All Paid Courses Free for First 4500 People. Claude Code, ChatGPT, AI automation and prompt engineering bundle.",
      canonicalUrl: "https://x.com/expertwith_AI/status/2071203728359903517",
      providerMetadata: {
        kind: "x_post",
        searchQuery: "Claude Code prompt workflows",
        likes: 2139,
        reposts: 1062,
        replies: 2203,
      },
    });

    expect(verdict.decision).toBe("reject");
    expect(verdict.eligibleForSummary).toBe(false);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(false);
    expect(verdict.flags).toEqual(
      expect.arrayContaining(["engagement_bait", "promo_offer"]),
    );
  });

  it("keeps resource-bait X lists out of top reads even with engagement", () => {
    const verdict = policy.evaluate({
      providerKey: "x-twitter",
      authorHandle: "Tanaypawar27",
      title:
        "Stop wasting hours trying to learn AI. I have already done it for you.",
      bodyPreview:
        "With one list. Zero confusion. And no fluff. Videos: LLM Introduction, LLMs from Scratch, Agentic AI Overview.",
      canonicalUrl: "https://x.com/Tanaypawar27/status/2073979626037391694",
      providerMetadata: {
        kind: "x_post",
        searchQuery: "openai anthropic claude llm",
        likes: 269,
        reposts: 111,
        replies: 35,
      },
    });

    expect(verdict.decision).toBe("downrank");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.flags).toEqual(expect.arrayContaining(["engagement_bait"]));
  });

  it("promotes self-contained topical X posts", () => {
    const verdict = policy.evaluate({
      providerKey: "x-twitter",
      authorHandle: "OpenAI",
      title:
        "OpenAI released new agent eval tooling for production reliability.",
      bodyPreview:
        "The update adds trace-based scoring, failure clustering and regression checks for AI agent deployments.",
      canonicalUrl: "https://x.com/OpenAI/status/2070000000000000000",
      providerMetadata: {
        kind: "x_post",
        searchQuery: "OpenAI agents",
        likes: 420,
        reposts: 90,
        replies: 31,
      },
    });

    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(true);
    expect(verdict.qualityScore).toBeGreaterThanOrEqual(0.8);
    expect(verdict.interestRelevanceScore).toBeGreaterThanOrEqual(0.8);
  });

  it("keeps prediction-market political rumors out of X top reads", () => {
    const verdict = policy.evaluate({
      providerKey: "x-twitter",
      authorHandle: "Polymarket",
      title:
        "Polymarket says Trump administration may allow Anthropic restore next week",
      bodyPreview:
        "Market odds moved after a rumor that the White House could allow Anthropic to restore access next week.",
      canonicalUrl: "https://x.com/Polymarket/status/2070920594380746857",
      providerMetadata: {
        kind: "x_post",
        searchQuery: "anthropic",
        likes: 5802,
        reposts: 316,
        replies: 211,
      },
    });

    expect(verdict.decision).toBe("downrank");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(true);
    expect(verdict.flags).toEqual(
      expect.arrayContaining(["prediction_market_rumor"]),
    );
  });

  it("keeps unreleased-model rumor posts out of non-X top reads", () => {
    const verdict = policy.evaluate({
      providerKey: "reddit",
      title: "Look at that scientist early tester on GPT-5.6 solved it",
      bodyPreview:
        "A Reddit rumor claims an early tester got access to an unreleased GPT-5.6 model.",
      canonicalUrl: "https://www.reddit.com/r/OpenAI/comments/example/",
      providerMetadata: {
        kind: "reddit_post",
        searchQuery: "OpenAI Claude Code agents",
        score: 467,
        numComments: 101,
      },
    });

    expect(verdict.decision).toBe("downrank");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(true);
    expect(verdict.flags).toEqual(expect.arrayContaining(["rumor_only"]));
  });

  it("keeps personal medical anecdotes out of non-X summaries", () => {
    const verdict = policy.evaluate({
      providerKey: "hacker-news",
      title: "I used Claude Code to get a second opinion on my MRI",
      bodyPreview:
        "A personal story about using Claude Code to review an MRI before talking to a doctor.",
      canonicalUrl: "https://news.ycombinator.com/item?id=48678825",
      providerMetadata: {
        kind: "hacker_news_story",
        searchQuery: "claude code codex cursor",
        points: 278,
        comments: 381,
      },
    });

    expect(verdict.decision).toBe("downrank");
    expect(verdict.eligibleForSummary).toBe(false);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(true);
    expect(verdict.flags).toEqual(
      expect.arrayContaining(["personal_medical_anecdote"]),
    );
  });

  it("does not let an LLM review override deterministic hard blockers", () => {
    const deterministic = policy.evaluate({
      providerKey: "x-twitter",
      title: "https://t.co/abc123",
      bodyPreview: "https://t.co/abc123",
      canonicalUrl: "https://x.com/example/status/1",
      providerMetadata: { kind: "x_post", searchQuery: "OpenAI" },
    });
    const merged = policy.mergeWithReview(deterministic, {
      decision: "promote",
      confidence: 0.98,
      qualityScore: 1,
      interestRelevanceScore: 1,
      engagementIntegrityScore: 1,
      flags: ["llm_promoted"],
      reason: "Model thought it looked important.",
    });

    expect(merged.eligibleForSummary).toBe(false);
    expect(merged.eligibleForTopRead).toBe(false);
    expect(merged.decision).toBe(deterministic.decision);
  });

  it("keeps off-topic non-X search results out of top reads while allowing LLM review", () => {
    const verdict = policy.evaluate({
      providerKey: "hacker-news",
      title: "The US Army issued ocarinas to soldiers in World War II",
      bodyPreview: "A history discussion about wartime musical instruments.",
      canonicalUrl: "https://news.ycombinator.com/item?id=48670103",
      providerMetadata: {
        kind: "hacker_news_story",
        searchQuery: "flutter dart",
        points: 167,
        comments: 77,
      },
    });

    expect(verdict.decision).toBe("downrank");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(true);
    expect(verdict.flags).toEqual(expect.arrayContaining(["weak_topic_match"]));
  });

  it("does not match short AI topic terms inside unrelated words", () => {
    const verdict = policy.evaluate({
      providerKey: "reddit",
      title: "The game industry is making me incredibly depressed and I'm done",
      bodyPreview:
        "Everything coming out this past month from Sony, Microsoft, Steam, GTA, Bethesda, Bungie, EVERYTHING has been a daily dose of end stage capitalism.",
      canonicalUrl:
        "https://www.reddit.com/r/gaming/comments/1ul3qtu/the_game_industry_is_making_me_incredibly/",
      providerMetadata: {
        kind: "reddit_post",
        score: 10132,
        subreddit: "gaming",
        numComments: 2700,
        searchQuery: "AI technology programming developer tools",
      },
    });

    expect(verdict.decision).toBe("downrank");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.needsLlmReview).toBe(true);
    expect(verdict.flags).toEqual(expect.arrayContaining(["weak_topic_match"]));
  });

  it("does not let standalone AI satisfy a broad developer-tools query in an unrelated subreddit", () => {
    const verdict = policy.evaluate({
      providerKey: "reddit",
      title: "AI generated game trailers are everywhere now",
      bodyPreview:
        "Players debate AI art in upcoming games without discussing code assistants or technical workflows.",
      canonicalUrl: "https://www.reddit.com/r/gaming/comments/example/",
      providerMetadata: {
        kind: "reddit_post",
        score: 9800,
        subreddit: "gaming",
        numComments: 1800,
        searchQuery: "AI technology programming developer tools",
      },
    });

    expect(verdict.decision).toBe("downrank");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.flags).toEqual(expect.arrayContaining(["weak_topic_match"]));
  });

  it("allows standalone AI when the source community matches a strong query term", () => {
    const verdict = policy.evaluate({
      providerKey: "reddit",
      title: "AI helper setup question",
      bodyPreview:
        "Discussion about configuring model-assisted code review in a production repo.",
      canonicalUrl: "https://www.reddit.com/r/programming/comments/example/",
      providerMetadata: {
        kind: "reddit_post",
        score: 312,
        subreddit: "programming",
        numComments: 49,
        searchQuery: "AI technology programming developer tools",
      },
    });

    expect(verdict.decision).toBe("promote");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(true);
    expect(verdict.flags).not.toContain("weak_topic_match");
  });

  it("uses nested interest query metadata to downrank off-topic HN discovery items", () => {
    const verdict = policy.evaluate({
      providerKey: "hacker-news",
      title:
        "Nintendo announces new product revisions in Europe with replaceable batteries",
      bodyPreview:
        "HN discussion about consumer hardware battery revisions in Europe.",
      canonicalUrl: "https://news.ycombinator.com/item?id=48804193",
      providerMetadata: {
        kind: "hacker_news_story",
        points: 275,
        comments: 171,
        interestQuerySnapshot: {
          query: "Claude Codex OpenAI coding agents AI developer tools",
        },
        sourceBindingSnapshot: {
          sourceQuery: {
            mode: "search",
            query: "AI developer Hacker News discovery",
          },
        },
      },
    });

    expect(verdict.decision).toBe("downrank");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.flags).toEqual(expect.arrayContaining(["weak_topic_match"]));
  });

  it("keeps legacy HN game-engine Fable matches out of top reads without topic context", () => {
    const verdict = policy.evaluate({
      providerKey: "hacker-news",
      title:
        "Command and Conquer Generals natively ported to macOS, iPhone, iPad using Fable",
      bodyPreview: "",
      canonicalUrl: "https://news.ycombinator.com/item?id=48788283",
      providerMetadata: {
        kind: "hacker_news_story",
        points: 130,
        comments: 67,
      },
    });

    expect(verdict.decision).toBe("downrank");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(false);
    expect(verdict.flags).toEqual(
      expect.arrayContaining(["missing_topic_context"]),
    );
  });

  it("keeps legacy HN AI-code items eligible through explicit core topic signals", () => {
    const verdict = policy.evaluate({
      providerKey: "hacker-news",
      title: "We charge $10k a week to delete AI-generated code",
      bodyPreview:
        "HN discussion about maintenance costs after teams adopt coding agents.",
      canonicalUrl: "https://news.ycombinator.com/item?id=48830001",
      providerMetadata: {
        kind: "hacker_news_story",
        points: 214,
        comments: 91,
      },
    });

    expect(verdict.decision).toBe("promote");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(true);
    expect(verdict.flags).toEqual(
      expect.arrayContaining(["missing_topic_context"]),
    );
  });

  it("keeps legacy HN privacy-policy items eligible through explicit core topic signals", () => {
    const verdict = policy.evaluate({
      providerKey: "hacker-news",
      title: "Virginia bans sale of geolocation data",
      bodyPreview:
        "HN discussion about privacy, surveillance and brokered mobile location data.",
      canonicalUrl: "https://news.ycombinator.com/item?id=48830002",
      providerMetadata: {
        kind: "hacker_news_story",
        points: 341,
        comments: 188,
      },
    });

    expect(verdict.decision).toBe("promote");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(true);
    expect(verdict.flags).toEqual(
      expect.arrayContaining(["missing_topic_context"]),
    );
  });

  it("keeps AI dev-kit HN items eligible through developer query aliases", () => {
    const verdict = policy.evaluate({
      providerKey: "hacker-news",
      title: "AMD Ryzen AI Halo - $4k AI Dev Kit",
      bodyPreview:
        "Developers discuss local AI inference hardware and workstation workflows.",
      canonicalUrl: "https://news.ycombinator.com/item?id=48805624",
      providerMetadata: {
        kind: "hacker_news_story",
        points: 222,
        comments: 162,
        interestQuerySnapshot: {
          query: "Claude Codex OpenAI coding agents AI developer tools",
        },
        sourceBindingSnapshot: {
          sourceQuery: {
            mode: "search",
            query: "AI developer Hacker News discovery",
          },
        },
      },
    });

    expect(verdict.decision).toBe("promote");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(true);
    expect(verdict.flags).not.toContain("weak_topic_match");
  });

  it("keeps AI token-pricing HN discussions eligible through technical community context", () => {
    const verdict = policy.evaluate({
      providerKey: "hacker-news",
      title: "Price per 1M tokens is meaningless",
      bodyPreview:
        "HN discussion about model pricing, inference workloads and token cost measurement.",
      canonicalUrl: "https://news.ycombinator.com/item?id=48800000",
      providerMetadata: {
        kind: "hacker_news_story",
        points: 42,
        comments: 17,
        interestQuerySnapshot: {
          query: "Claude Codex OpenAI coding agents AI developer tools",
        },
        sourceBindingSnapshot: {
          sourceQuery: {
            mode: "search",
            query: "AI developer Hacker News discovery",
          },
        },
      },
    });

    expect(verdict.decision).toBe("promote");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(true);
    expect(verdict.flags).not.toContain("weak_topic_match");
  });

  it("keeps HN RSS token-pricing items eligible through feed community context", () => {
    const verdict = policy.evaluate({
      providerKey: "rss",
      title: "Price per 1M tokens is meaningless",
      bodyPreview:
        "Article URL: https://janilowski.pl/en/blog/2026/price-per-m-tokens/ Comments URL: https://news.ycombinator.com/item?id=48809542",
      canonicalUrl: "https://janilowski.pl/en/blog/2026/price-per-m-tokens/",
      providerMetadata: {
        kind: "rss_item",
        feedUrl: "https://hnrss.org/frontpage",
        interestQuerySnapshot: {
          query: "Claude Codex OpenAI coding agents AI developer tools",
        },
        sourceBindingSnapshot: {
          sourceQuery: {
            mode: "url",
            query:
              "https://news.google.com/rss/search?q=OpenAI%20OR%20Claude%20OR%20developer%20tools",
          },
        },
      },
    });

    expect(verdict.decision).toBe("promote");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(true);
    expect(verdict.flags).not.toContain("weak_topic_match");
  });

  it("uses concise RSS search queries as topic terms without trusting long feed URLs", () => {
    const verdict = policy.evaluate({
      providerKey: "rss",
      title:
        "Bumblebee: A zero-dependency Go scanner for malicious MCP servers and extensions",
      bodyPreview:
        "Article URL: https://github.com/perplexityai/bumblebee Comments URL: https://news.ycombinator.com/item?id=48809896",
      canonicalUrl: "https://github.com/perplexityai/bumblebee",
      providerMetadata: {
        kind: "rss_item",
        feedUrl: "https://hnrss.org/newest?q=Go",
        searchQuery: "Go",
        interestQuerySnapshot: {
          query: "Claude Codex OpenAI coding agents AI developer tools",
        },
        sourceBindingSnapshot: {
          sourceQuery: {
            mode: "url",
            query:
              "https://news.google.com/rss/search?q=OpenAI%20OR%20Claude%20OR%20developer%20tools",
          },
        },
      },
    });

    expect(verdict.decision).toBe("promote");
    expect(verdict.eligibleForSummary).toBe(true);
    expect(verdict.eligibleForTopRead).toBe(true);
    expect(verdict.flags).not.toContain("weak_topic_match");
  });
});
