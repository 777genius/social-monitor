import {
  classifyOpenAiHttpFailure,
  readOpenAiResponseBody,
} from "./openai-responses-summary-http-failure";
import {
  classifyOpenAiHttpFailure as historicalHttpClassifier,
  readOpenAiResponseBody as historicalBodyReader,
} from "./openai-responses-summary-model-error";

describe("OpenAI summary HTTP response boundary", () => {
  it("keeps the historical exports as identical functions", () => {
    expect(historicalHttpClassifier).toBe(classifyOpenAiHttpFailure);
    expect(historicalBodyReader).toBe(readOpenAiResponseBody);
  });

  it.each([
    { status: 429, kind: "provider_rate_limited", retryable: true },
    { status: 400, kind: "context_too_large", retryable: false },
    { status: 413, kind: "context_too_large", retryable: false },
    { status: 401, kind: "provider_unavailable", retryable: false },
    { status: 403, kind: "provider_unavailable", retryable: false },
    { status: 500, kind: "provider_unavailable", retryable: true },
    { status: 503, kind: "provider_unavailable", retryable: true },
    { status: 422, kind: "provider_unavailable", retryable: false },
  ])("preserves the exact failure taxonomy for HTTP $status", ({ status, kind, retryable }) => {
    expect(classifyOpenAiHttpFailure(status, {
      error: { message: "Synthetic provider rejection" },
    })).toEqual({ kind, retryable, message: "Synthetic provider rejection" });
  });

  it("never treats a blank or malformed error message as a provider message", () => {
    expect(classifyOpenAiHttpFailure(503, {
      error: { message: "   " },
    })).toEqual({
      kind: "provider_unavailable",
      retryable: true,
      message: "OpenAI summary request failed with HTTP 503",
    });
    expect(classifyOpenAiHttpFailure(429, {
      error: { message: { unexpected: "object" } },
    })).toEqual({
      kind: "provider_rate_limited",
      retryable: true,
      message: "OpenAI summary request failed with HTTP 429",
    });
  });

  it.each([
    ["", {}],
    [" \n  ", {}],
    ['{"ok":true}', { ok: true }],
    ["not-json", { error: { message: "not-json" } }],
  ])("preserves body decoding without interpreting it as successful output", async (raw, expected) => {
    const response = { text: async () => raw } as unknown as Response;
    await expect(readOpenAiResponseBody(response)).resolves.toEqual(expected);
  });

  it("propagates a body read rejection unchanged", async () => {
    const failure = new Error("Synthetic transport read failure");
    const response = { text: async () => { throw failure; } } as unknown as Response;
    await expect(readOpenAiResponseBody(response)).rejects.toBe(failure);
  });
});
