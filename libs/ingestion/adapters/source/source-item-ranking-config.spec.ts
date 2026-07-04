import { readSourceItemRankingPlan } from "./source-item-ranking-config";

describe("source item ranking config", () => {
  it("defaults to relevance mode and appends fallback queries", () => {
    expect(readSourceItemRankingPlan(undefined, ["Claude Code"])).toEqual({
      mode: "relevance",
      queries: ["Claude Code"],
    });
  });

  it("reads ranking aliases from source runtime config", () => {
    expect(
      readSourceItemRankingPlan(
        {
          sourceRankingMode: "engagement-first",
          rankingQuery: "OpenAI",
          sourceRankingQuery: "Claude Code",
          rankingQueries: ["MCP server"],
          sourceRankingQueries: ["Cursor AI", "OpenAI"],
        },
        ["fallback query"],
      ),
    ).toEqual({
      mode: "engagement",
      queries: [
        "MCP server",
        "Cursor AI",
        "OpenAI",
        "Claude Code",
        "fallback query",
      ],
    });
  });

  it("falls back to rankingMode when sourceRankingMode is blank", () => {
    expect(
      readSourceItemRankingPlan(
        { sourceRankingMode: " ", rankingMode: "hybrid" },
        ["OpenAI"],
      ),
    ).toEqual({
      mode: "hybrid",
      queries: ["OpenAI"],
    });
  });

  it("rejects unsupported ranking modes", () => {
    expect(() =>
      readSourceItemRankingPlan({ rankingMode: "relevnace" }, ["OpenAI"]),
    ).toThrow("Unsupported source ranking mode");
  });
});
