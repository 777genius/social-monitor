import {
  resolveRelevanceContentQualityOpenAiOptions,
  resolveRelevanceContentQualityReviewerMode,
} from "./relevance-provider-tokens";

describe("relevance provider tokens", () => {
  it("keeps source content quality reviewer disabled by default without an OpenAI key", () => {
    expect(resolveRelevanceContentQualityReviewerMode({})).toBe("disabled");
  });

  it("enables source content quality reviewer by default when an OpenAI key is configured", () => {
    expect(
      resolveRelevanceContentQualityReviewerMode({
        OPENAI_API_KEY: "test-key",
      }),
    ).toBe("openai-responses");
    expect(
      resolveRelevanceContentQualityReviewerMode({
        OPENAI_API_KEY_FILE: "/private/openai.key",
      }),
    ).toBe("openai-responses");
  });

  it("allows disabling source content quality reviewer even when an OpenAI key exists", () => {
    expect(
      resolveRelevanceContentQualityReviewerMode({
        RELEVANCE_CONTENT_QUALITY_REVIEWER: "disabled",
        OPENAI_API_KEY: "test-key",
      }),
    ).toBe("disabled");
  });

  it("requires an OpenAI key when source content quality reviewer is enabled", () => {
    expect(() =>
      resolveRelevanceContentQualityOpenAiOptions(
        {
          RELEVANCE_CONTENT_QUALITY_REVIEWER: "openai-responses",
        },
        { requireApiKey: true },
      ),
    ).toThrow(
      "RELEVANCE_CONTENT_QUALITY_REVIEWER=openai-responses requires OPENAI_API_KEY or OPENAI_API_KEY_FILE",
    );
  });

  it("uses shared OpenAI env for the source content quality reviewer", () => {
    expect(
      resolveRelevanceContentQualityOpenAiOptions(
        {
          OPENAI_API_KEY: " test-key ",
          RELEVANCE_CONTENT_QUALITY_OPENAI_MODEL: "test-model",
          RELEVANCE_CONTENT_QUALITY_OPENAI_TIMEOUT_MS: "1234",
        },
        { requireApiKey: true },
      ),
    ).toEqual(
      expect.objectContaining({
        apiKey: "test-key",
        model: "test-model",
        timeoutMs: 1234,
      }),
    );
  });
});
