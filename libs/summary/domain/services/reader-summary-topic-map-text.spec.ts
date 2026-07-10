import { readerSummaryTopicLabelFromSlug } from "./reader-summary-topic-map-text";

describe("readerSummaryTopicLabelFromSlug", () => {
  it.each([
    ["openai-ecosystem", "OpenAI Ecosystem"],
    ["xai-models", "xAI Models"],
    ["github-mcp-tools", "GitHub MCP Tools"],
  ])("formats canonical topic group %s", (slug, expected) => {
    expect(readerSummaryTopicLabelFromSlug(slug)).toBe(expected);
  });
});
