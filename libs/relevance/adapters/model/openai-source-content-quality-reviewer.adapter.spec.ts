import { OpenAiSourceContentQualityReviewerAdapter } from "./openai-source-content-quality-reviewer.adapter";

describe("OpenAiSourceContentQualityReviewerAdapter", () => {
  it("requests structured X post quality reviews through the Responses API", async () => {
    const calls: Array<{ readonly input: string | URL; readonly init?: RequestInit }> = [];
    const adapter = new OpenAiSourceContentQualityReviewerAdapter({
      apiKey: "test-openai-key",
      model: "test-model",
      fetchFn: async (input, init) => {
        calls.push({ input, init });

        return new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      reviews: [
                        {
                          candidateId: "feed-x-bait",
                          decision: "reject",
                          confidence: 0.92,
                          qualityScore: 0.2,
                          topicRelevanceScore: 0.4,
                          engagementIntegrityScore: 0.18,
                          flags: ["llm_rejected", "engagement_bait"],
                          reason: "Engagement bait without concrete evidence.",
                        },
                      ],
                    }),
                  },
                ],
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    });

    const reviews = await adapter.reviewBatch([
      {
        candidateId: "feed-x-bait",
        providerKey: "x-twitter",
        title: "Drop your top 3 OpenAI agent tools",
        bodyPreview: "Reply with your top 3.",
        canonicalUrl: "https://x.com/example/status/1",
        providerMetadata: {
          kind: "x_post",
          searchQuery: "OpenAI agents",
          likes: 500,
          reposts: 80,
          hiddenRawPayload: "must not be sent",
        },
        deterministic: {
          qualityScore: 0.52,
          topicRelevanceScore: 0.8,
          engagementIntegrityScore: 0.48,
          eligibleForSummary: true,
          eligibleForTopRead: false,
          needsLlmReview: true,
          decision: "downrank",
          flags: ["engagement_bait"],
          reason: "downrank because engagement_bait",
        },
      },
    ]);

    expect(calls[0]?.input).toBe("https://api.openai.com/v1/responses");
    expect(calls[0]?.init?.headers).toEqual(
      expect.objectContaining({
        authorization: "Bearer test-openai-key",
        "content-type": "application/json",
      }),
    );
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.model).toBe("test-model");
    expect(body.store).toBe(false);
    expect(body.text.format.name).toBe(
      "social_monitor_source_content_quality_review",
    );
    expect(body.input).toContain("feed-x-bait");
    expect(body.input).not.toContain("hiddenRawPayload");
    expect(reviews).toEqual([
      {
        candidateId: "feed-x-bait",
        decision: "reject",
        confidence: 0.92,
        qualityScore: 0.2,
        topicRelevanceScore: 0.4,
        engagementIntegrityScore: 0.18,
        flags: ["llm_rejected", "engagement_bait"],
        reason: "Engagement bait without concrete evidence.",
      },
    ]);
  });
});
