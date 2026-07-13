import { evaluateTopicLabelQuality } from "./reader-summary-topic-map-label-quality";
import { sanitizeTopicNodeLabel } from "./reader-summary-topic-node-label-sanitizer";

describe("sanitizeTopicNodeLabel", () => {
  it("preserves normalized structured semantics for evidence alignment", () => {
    expect(
      sanitizeTopicNodeLabel({
        nodeId: "topic:codex",
        label: "Codex core Availability",
        semantic: {
          subject: "  Codex core ",
          parentSubject: "  OpenAI ",
          claimType: "availability",
          qualifier: " ",
          confidenceScore: 1.4,
        },
      }).semantic,
    ).toEqual({
      subject: "Codex core",
      parentSubject: "OpenAI",
      claimType: "availability",
      confidenceScore: 1,
    });
  });
});

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

  it.each([
    "Codex CLI Say",
    "OpenAI Brings ChatGPT",
    "We're Bringing Codex",
    "Grok Grok Created",
    "GPT-5 Consuming Usage",
    "Didn Expect One",
    "Grok Serious Run",
    "Grok Here Honest",
    "Biggest Scam Humanity",
    "Scientists Come Work",
    "Often Forget Clueless",
    "Scam Humanity Normal",
    "Claude Any AI",
    "OpenKnowledge Best Markdown",
    "Love LLMs Hate",
    "GPT 5.6 Migrating Production AI",
    "Claude Code 50% increase",
    "Model Usage decrease",
  ])("rejects headline fragment label %s", (label) => {
    expect(
      evaluateTopicLabelQuality(label, {
        evidenceTexts: [`${label} appears verbatim in collected evidence.`],
      }),
    ).toMatchObject({ accepted: false, score: 0 });
  });

  it.each(["Codex CLI", "OpenAI ChatGPT", "Grok", "GPT-5 Usage"])(
    "accepts noun phrase label %s",
    (label) => {
      expect(
        evaluateTopicLabelQuality(label, {
          evidenceTexts: [`${label} appears in collected evidence.`],
        }),
      ).toMatchObject({ accepted: true });
    },
  );

  it("rejects an ungrounded qualifier attached to a grounded entity", () => {
    expect(
      evaluateTopicLabelQuality("Grok Kunchenguid", {
        evidenceTexts: ["Grok 4.5 model review"],
      }),
    ).toMatchObject({
      accepted: false,
      groundedTokenCount: 1,
      reasons: expect.arrayContaining([
        "label is not grounded in collected evidence",
      ]),
    });
  });

  it("rejects a reader-facing label longer than four words", () => {
    expect(
      evaluateTopicLabelQuality("GPT 5.6 Production AI Efficiency", {
        evidenceTexts: ["GPT 5.6 production AI efficiency"],
      }),
    ).toMatchObject({
      accepted: false,
      reasons: expect.arrayContaining(["label is longer than four words"]),
    });
  });
});
