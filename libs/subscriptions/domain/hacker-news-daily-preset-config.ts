// Hacker News multi-pass daily scan configuration for the AI developer preset.
const hackerNewsAskRequiredKeywords = [
  "ai",
  "agent",
  "agents",
  "llm",
  "developer",
  "programming",
  "security",
  "open source",
  "startup",
  "coding",
] as const;

const hackerNewsCommentStoryKeywords = [
  "ai",
  "agent",
  "agents",
  "llm",
  "mcp",
  "model context protocol",
  "developer",
  "developer tools",
  "code",
  "coding",
  "cursor",
  "claude",
  "open source",
  "security",
  "tool",
  "cli",
  "server",
] as const;

export const hackerNewsDailyMultiPassConfig = {
  maxItems: 100,
  maxItemAgeHours: 48,
  scanPasses: [
    { mode: "listing", listing: "top", maxItems: 50 },
    { mode: "listing", listing: "best", maxItems: 40 },
    { mode: "listing", listing: "show", maxItems: 30 },
    {
      mode: "listing",
      listing: "ask",
      maxItems: 30,
      requiredKeywords: hackerNewsAskRequiredKeywords,
    },
    ..."openai|claude|claude code codex cursor|ai coding agents|llm|developer tools|flutter dart|javascript node|python developer tools|rust go programming|cybersecurity|technology startup infrastructure|model context protocol|open source ai|typescript developer tools|security vulnerability|ai infrastructure|mcp server|cursor ai|vibe coding"
      .split("|")
      .map((query) => ({
        mode: "search" as const,
        target: "story" as const,
        query,
        maxItems: 20,
      })),
    ..."claude code|model context protocol|developer tools|cursor ai"
      .split("|")
      .map((query) => ({
        mode: "search" as const,
        target: "comment" as const,
        query,
        maxItems: 15,
        requiredStoryKeywords: hackerNewsCommentStoryKeywords,
      })),
  ],
} as const;
