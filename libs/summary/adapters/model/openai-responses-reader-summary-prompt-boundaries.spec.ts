import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import { buildOpenAiReaderSummaryPromptPayload } from "./openai-responses-reader-summary-prompt";
import {
  dailyDigestInstructions,
  readerSummaryFormatLabel,
} from "./openai-responses-reader-summary-daily-instructions";

describe("reader-summary prompt boundaries", () => {
  it("preserves selected coverage identity in the serialized wire payload", () => {
    const input = readerSummaryInput();
    const raw = JSON.parse(buildOpenAiReaderSummaryPromptPayload(input)) as {
      coveragePlan: { mode: string; lead: unknown };
      requestedAt: string;
    };
    expect(raw.coveragePlan.mode).toBe(input.coveragePlan.mode);
    expect(raw.requestedAt).toBe(input.requestedAt.toISOString());
  });

  it("retains exact user-facing format labels in daily instructions", () => {
    expect(readerSummaryFormatLabel("executive_brief")).toBe("executive summary");
    expect(readerSummaryFormatLabel("risk_brief")).toBe("risk summary");
    expect(readerSummaryFormatLabel("bullet_digest")).toBe("bullet digest");
    expect(dailyDigestInstructions(readerSummaryInput())).toContain(
      "The evidence array is the complete ordinary-post model input",
    );
  });
});
