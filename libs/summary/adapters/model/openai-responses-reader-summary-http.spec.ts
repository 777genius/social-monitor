import {
  classifyOpenAiReaderSummaryHttpFailure as classifyFromHttp,
  readOpenAiResponseBody,
} from "./openai-responses-reader-summary-http";
import { classifyOpenAiReaderSummaryHttpFailure } from "./openai-responses-reader-summary-http-failure";

describe("OpenAI reader summary HTTP trust boundary", () => {
  it("retains the legacy public classifier export as the exact same function", () => {
    expect(classifyFromHttp).toBe(classifyOpenAiReaderSummaryHttpFailure);
  });

  it.each([
    [429, "provider_rate_limited", true],
    [400, "context_too_large", false],
    [413, "context_too_large", false],
    [401, "provider_unavailable", false],
    [403, "provider_unavailable", false],
    [500, "provider_unavailable", true],
    [503, "provider_unavailable", true],
    [418, "provider_unavailable", false],
  ] as const)("maps HTTP %i to %s (retryable=%s)", (status, kind, retryable) => {
    expect(classifyOpenAiReaderSummaryHttpFailure(status, null)).toEqual({
      kind,
      retryable,
      message: `OpenAI reader summary request failed with HTTP ${status}`,
    });
  });

  it("preserves a nested provider error message without changing the retry policy", () => {
    expect(classifyOpenAiReaderSummaryHttpFailure(429, {
      error: { message: "synthetic rate limit" },
    })).toEqual({
      kind: "provider_rate_limited",
      retryable: true,
      message: "synthetic rate limit",
    });
  });

  it("ignores malformed provider error shapes and falls back to the HTTP status", () => {
    for (const body of [null, [], { error: null }, { error: ["bad"] },
      { error: { message: 42 } }, "non-object"]) {
      expect(classifyOpenAiReaderSummaryHttpFailure(503, body).message).toBe(
        "OpenAI reader summary request failed with HTTP 503",
      );
    }
  });

  it("decodes valid JSON without doing error classification", async () => {
    expect(await readOpenAiResponseBody(new Response('{"output":[]}', { status: 429 })))
      .toEqual({ output: [] });
  });

  it("preserves empty-body and invalid-JSON fallbacks exactly", async () => {
    expect(await readOpenAiResponseBody(new Response("  \n  "))).toEqual({});
    expect(await readOpenAiResponseBody(new Response("not-json"))).toEqual({ raw: "not-json" });
  });
});
