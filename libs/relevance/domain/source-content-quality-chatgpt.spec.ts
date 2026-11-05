import { SourceContentQualityPolicy } from "./source-content-quality";
import { normalizeSourceContentQualityInput } from "./source-content-quality-normalizer";

const policy = new SourceContentQualityPolicy();
const titleWith = (term: string): string =>
  `Has anyone else felt their daily life improved since using ${term}?`;

describe("ChatGPT lexical topic context", () => {
  it.each(["ChatGPT", "chatgpt", "CHATGPT", "cHaTgPt", "(ChatGPT)", "'ChatGPT'"])(
    "recognizes the standalone core signal %s without query metadata",
    (term) => {
      const input = { providerKey: "reddit", title: titleWith(term) };
      expect(normalizeSourceContentQualityInput(input)).toMatchObject({
        legacyCoreTopicSignal: true,
        missingTopicContext: true,
      });
      expect(policy.evaluate(input)).toMatchObject({
        interestRelevanceScore: 0.78,
        decision: "promote",
        eligibleForTopRead: true,
      });
    },
  );

  it.each(["ChatGPT", "chatgpt", "CHATGPT", "cHaTgPt", "(ChatGPT)"])(
    "matches %s against an explicit AI interest through existing aliases",
    (term) => {
      const verdict = policy.evaluate({
        providerKey: "reddit",
        title: titleWith(term),
        providerMetadata: { interestQuerySnapshot: { query: "AI" } },
      });
      expect(verdict.interestRelevanceScore).toBe(0.9);
      expect(verdict.flags).not.toContain("weak_topic_match");
    },
  );

  it.each([
    "prechatgpt", "chatgptish", "xchatgptx", "chatgpt2", "2chatgpt",
    "chatgpt_helper", "helper_chatgpt", "CHATGPTISH",
  ])("does not recognize the embedded substring %s", (term) => {
    const input = { providerKey: "reddit", title: titleWith(term) };
    expect(normalizeSourceContentQualityInput(input).legacyCoreTopicSignal)
      .toBe(false);
    expect(policy.evaluate(input)).toMatchObject({
      interestRelevanceScore: 0.49,
      decision: "downrank",
      eligibleForTopRead: false,
    });
    expect(policy.evaluate({
      ...input,
      providerMetadata: { interestQuerySnapshot: { query: "AI" } },
    })).toMatchObject({
      interestRelevanceScore: 0.38,
      flags: ["weak_topic_match"],
    });
  });

  it("recognizes explicit body context without using URL text as context", () => {
    expect(policy.evaluate({
      providerKey: "reddit",
      title: "A synthetic account of changes to everyday habits",
      bodyPreview: "I have been using ChatGPT to organize daily tasks.",
    }).interestRelevanceScore).toBe(0.78);
    expect(policy.evaluate({
      providerKey: "reddit",
      title: "A synthetic account of changes to everyday habits",
      bodyPreview: "https://example.test/ChatGPT",
    }).interestRelevanceScore).toBe(0.49);
  });

  it.each(["GPT", "GPT-4", "OpenAI", "Anthropic", "Claude", "LLM", "LLMs"])(
    "preserves the existing standalone core signal %s",
    (term) => expect(policy.evaluate({
      providerKey: "reddit", title: titleWith(term),
    }).interestRelevanceScore).toBe(0.78),
  );

  it.each([
    "artificial", "intelligence", "llm", "llms", "gpt", "openai",
    "anthropic", "claude", "model", "models", "token", "tokens",
    "inference", "neural", "stochastic", "parrot", "parrots",
  ])("preserves the existing AI alias %s", (term) => {
    expect(policy.evaluate({
      providerKey: "reddit",
      title: titleWith(term),
      providerMetadata: { interestQuerySnapshot: { query: "AI" } },
    }).interestRelevanceScore).toBe(0.9);
  });
});
