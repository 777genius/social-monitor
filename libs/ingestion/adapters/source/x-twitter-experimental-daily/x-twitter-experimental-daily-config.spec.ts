import {
  nextCursorForQueries,
  readCursorByQuery,
  readSearchQueries,
} from "./x-twitter-experimental-daily-config";

describe("X/Twitter daily search query config", () => {
  it("keeps explicit searchQueries backward compatible", () => {
    expect(
      readSearchQueries("ai agents", {
        searchQueries: ["mcp server", "cursor ai", "mcp server"],
      }),
    ).toEqual(["ai agents", "mcp server", "cursor ai"]);
  });

  it("compiles product, from, mention and fallback lanes from queryPlan", () => {
    expect(
      readSearchQueries("AI agents MCP Claude Code launch", {
        queryPlan: {
          productTerms: ["Claude Code", "OpenAI Codex", "MCP server"],
          handles: ["@OpenAI", "AnthropicAI"],
          maxQueries: 8,
        },
      }),
    ).toEqual([
      "AI agents MCP Claude Code launch",
      '("Claude Code" OR "OpenAI Codex" OR "MCP server")',
      "from:OpenAI",
      "from:AnthropicAI",
      "@OpenAI",
      "@AnthropicAI",
      "ai agents",
    ]);
  });

  it("lets config disable noisy lane families", () => {
    expect(
      readSearchQueries("AI agents MCP Claude Code launch", {
        queryLanes: {
          productTerms: ["Claude Code", "OpenAI Codex"],
          handles: ["OpenAI"],
          includeMentionLanes: false,
          includeFallbackQuery: false,
        },
      }),
    ).toEqual([
      "AI agents MCP Claude Code launch",
      '("Claude Code" OR "OpenAI Codex")',
      "from:OpenAI",
    ]);
  });

  it("preserves previous per-query cursors when a lane does not return a new cursor", () => {
    const previousCursor = readCursorByQuery(
      JSON.stringify({
        queries: {
          "ai agents": "old-ai",
          "mcp server": "old-mcp",
        },
      }),
    );
    const nextCursor = nextCursorForQueries(
      ["ai agents", "mcp server"],
      new Map([["ai agents", "new-ai"]]),
      previousCursor,
    );

    expect(nextCursor).toBe(
      JSON.stringify({
        queries: {
          "ai agents": "new-ai",
          "mcp server": "old-mcp",
        },
      }),
    );
  });
});
