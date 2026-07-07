import { evaluateTopicLabelQuality } from "./reader-summary-topic-map-label-quality";

describe("evaluateTopicLabelQuality", () => {
  it("rejects generic capitalized one-word labels even when evidence contains them", () => {
    const genericLabels = [
      "People",
      "Council",
      "Breaking",
      "Updates",
      "Launch",
      "Workers",
      "News",
      "Ship",
      "Your",
      "Verify",
    ];

    for (const label of genericLabels) {
      expect(
        evaluateTopicLabelQuality(label, {
          evidenceTexts: [
            `${label} appeared in a sanitized provider headline without naming a concrete topic.`,
          ],
        }),
      ).toMatchObject({
        accepted: false,
        score: 0,
      });
    }
  });

  it("accepts concrete product, company, protocol and model labels when grounded", () => {
    const concreteLabels = [
      "Claude Code",
      "OpenAI Realtime",
      "Secure MCP",
      "GPT-5 Codex",
      "Palantir",
    ];

    for (const label of concreteLabels) {
      expect(
        evaluateTopicLabelQuality(label, {
          evidenceTexts: [
            `${label} is discussed as a specific monitored product or technology topic.`,
          ],
        }),
      ).toMatchObject({
        accepted: true,
      });
    }
  });

  it("rejects source and UI labels through provider context", () => {
    expect(
      evaluateTopicLabelQuality("Hacker News", {
        providerLabels: ["hacker-news", "Hacker News"],
      }),
    ).toMatchObject({
      accepted: false,
      reasons: expect.arrayContaining(["label is a source or UI meta label"]),
    });

    expect(evaluateTopicLabelQuality("Topic Map")).toMatchObject({
      accepted: false,
      reasons: expect.arrayContaining(["label is a source or UI meta label"]),
    });
  });
});
