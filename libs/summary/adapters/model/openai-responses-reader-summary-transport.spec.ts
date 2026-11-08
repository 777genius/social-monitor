import {
  createOpenAiReaderSummaryResponse,
  ReaderSummaryModelProviderError,
} from "./openai-responses-reader-summary-transport";

describe("OpenAI reader-summary transport boundary", () => {
  it("keeps the JSON body, request deadline and synthetic credentials", async () => {
    const request = { model: "synthetic", store: false };
    const fetchFn = jest.fn(async (url: string | URL, init?: RequestInit) => {
      expect(url).toBe("https://example.invalid/responses");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        authorization: ["Bearer", "synthetic-key"].join(" "),
      });
      expect(JSON.parse(String(init?.body))).toEqual(request);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ status: "completed" }), { status: 200 });
    });
    expect(await createOpenAiReaderSummaryResponse({
      request,
      apiKey: "synthetic-key",
      endpointUrl: "https://example.invalid/responses",
      timeoutMs: 200,
      fetchFn,
    })).toEqual({ status: "completed" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("keeps HTTP refusal and malformed JSON objects fail-closed", async () => {
    const params = {
      request: {},
      apiKey: "synthetic-key",
      endpointUrl: "https://example.invalid/responses",
      timeoutMs: 200,
    };
    await expect(createOpenAiReaderSummaryResponse({
      ...params,
      fetchFn: async () => new Response("{}", { status: 403 }),
    })).rejects.toBeInstanceOf(ReaderSummaryModelProviderError);
    await expect(createOpenAiReaderSummaryResponse({
      ...params,
      fetchFn: async () => new Response(JSON.stringify([]), { status: 200 }),
    })).rejects.toMatchObject({ failure: { kind: "invalid_schema", retryable: false } });
  });
});
