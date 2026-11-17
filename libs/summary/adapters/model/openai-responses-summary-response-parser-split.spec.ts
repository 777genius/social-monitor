import { SummaryModelProviderError } from "./openai-responses-summary-model-error";
import {
  extractOpenAiSummaryOutputText as legacyOutputText,
  parseOpenAiSummaryJsonObject,
  resolveOpenAiSummaryUsage as legacyUsage,
} from "./openai-responses-summary-response-parser";
import { extractOpenAiSummaryOutputText } from "./openai-responses-summary-output-text";
import { resolveOpenAiSummaryUsage } from "./openai-responses-summary-usage";

describe("ordinary OpenAI response admission responsibilities", () => {
  it("retains identical historical export objects and exact missing-usage estimate identity", () => {
    expect(legacyOutputText).toBe(extractOpenAiSummaryOutputText);
    expect(legacyUsage).toBe(resolveOpenAiSummaryUsage);

    const estimate = Object.freeze({
      inputTokens: 12, outputTokens: 34, estimatedCostUsd: 0.05,
    });
    expect(resolveOpenAiSummaryUsage({}, estimate)).toBe(estimate);
    expect(resolveOpenAiSummaryUsage({ usage: "untrusted" }, estimate)).toBe(estimate);
    expect(resolveOpenAiSummaryUsage({
      usage: { input_tokens: 0, output_tokens: -2 },
    }, estimate)).toEqual({
      inputTokens: 0, outputTokens: 34, estimatedCostUsd: 0.05,
    });
  });

  it("keeps direct output precedence then walks trusted-shaped nested content in wire order", () => {
    const nested = Object.freeze({
      output_text: "  ",
      output: [
        null,
        { content: [{ text: 123 }, { text: "  first nested  " }] },
        { content: [{ text: "second nested" }] },
      ],
    });
    expect(extractOpenAiSummaryOutputText(nested)).toBe("  first nested  ");
    expect(legacyOutputText({ ...nested, output_text: " direct " })).toBe(" direct ");
    expect(extractOpenAiSummaryOutputText(nested)).toBe("  first nested  ");
  });

  it("rejects non-object JSON and never treats missing provider text as a valid output", () => {
    expect(extractOpenAiSummaryOutputText({
      output_text: " \t ",
      output: [{ content: [null, { text: "" }, { text: 7 }] }],
    })).toBeUndefined();
    expect(() => parseOpenAiSummaryJsonObject("[]")).toThrow(SummaryModelProviderError);
    expect(() => parseOpenAiSummaryJsonObject("{not-json")).toThrow(SummaryModelProviderError);
    expect(parseOpenAiSummaryJsonObject('{"ok":true}')).toEqual({ ok: true });
    const secret = 'PRIVATE_PROVIDER_DATA_DO_NOT_LOG';
    let rejected: unknown;
    try { parseOpenAiSummaryJsonObject(secret); } catch (error) { rejected = error; }
    expect(rejected).toBeInstanceOf(SummaryModelProviderError);
    expect((rejected as Error).message).toBe('OpenAI summary output must be JSON');
    expect((rejected as Error).message).not.toContain(secret);
  });
});
