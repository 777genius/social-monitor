import type { JsonObject } from "@social-monitor/shared-kernel";

export const authoritativeReaderSummaryProviderMetadata = (
  providerKey: "x-twitter" | "reddit" | "hacker-news",
  signal: number,
): JsonObject => {
  switch (providerKey) {
    case "x-twitter":
      return {
        kind: "x_post",
        contentKind: "original_post",
        likes: signal,
        reposts: Math.floor(signal / 10),
      };
    case "reddit":
      return {
        kind: "reddit_post",
        score: signal,
        upvoteRatio: 0.91,
      };
    case "hacker-news":
      return {
        kind: "hacker_news_story",
        points: signal,
      };
  }
};
