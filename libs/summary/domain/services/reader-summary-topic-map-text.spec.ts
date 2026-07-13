import {
  canonicalizeReaderSummaryTopicAcronyms,
  readerSummaryTopicLabelFromSlug,
} from "./reader-summary-topic-map-text";

describe("canonicalizeReaderSummaryTopicAcronyms", () => {
  it.each([
    ["GPT 5.6 Ai Efficiency", "GPT 5.6 AI Efficiency"],
    ["LLMs Hype", "LLM Hype"],
    ["Openai MCP tools", "OpenAI MCP tools"],
  ])("normalizes %s", (value, expected) => {
    expect(canonicalizeReaderSummaryTopicAcronyms(value)).toBe(expected);
  });
});

describe("readerSummaryTopicLabelFromSlug", () => {
  it.each([
    ["openai-ecosystem", "OpenAI Ecosystem"],
    ["xai-models", "xAI Models"],
    ["github-mcp-tools", "GitHub MCP Tools"],
  ])("formats canonical topic group %s", (slug, expected) => {
    expect(readerSummaryTopicLabelFromSlug(slug)).toBe(expected);
  });
});
