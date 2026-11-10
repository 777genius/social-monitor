import type { ReaderSummaryModelInput, ReaderSummaryModelRoute } from "../../ports";
import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import { withReaderSummaryInputPromptVersion } from "./reader-summary-input-prompt-route";

describe("withReaderSummaryInputPromptVersion", () => {
  const originalRoute: ReaderSummaryModelRoute = {
    provider: "agent-runtime",
    model: "codex:gpt-5.6-sol:high",
    promptVersion: "reader_summary.prompt.canonical",
    schemaVersion: "reader_summary.artifact.v1",
  };

  it("keeps the canonical release with neither daily input nor editorial plan", () => {
    const input = readerSummaryInput();
    const resolved = withReaderSummaryInputPromptVersion(originalRoute, input);

    expect(resolved).toEqual(originalRoute);
    expect(resolved).not.toBe(originalRoute);
  });

  it("uses the exact daily digest release when generation evidence is present", () => {
    const input = readerSummaryInput();
    const dailyInput: ReaderSummaryModelInput = {
      ...input,
      evidence: {
        ...input.evidence,
        dailyGenerationInput: {} as NonNullable<ReaderSummaryModelInput["evidence"]["dailyGenerationInput"]>,
      },
    };

    const resolved = withReaderSummaryInputPromptVersion(originalRoute, dailyInput);
    expect(resolved).toEqual({
      ...originalRoute,
      promptVersion: "reader_summary.prompt.2026-11-03.daily_likes_digest",
    });
    expect(originalRoute.promptVersion).toBe("reader_summary.prompt.canonical");
  });

  it("gives an explicit editorial plan precedence over the digest for either provider", () => {
    const input = readerSummaryInput();
    const editorialInput: ReaderSummaryModelInput = {
      ...input,
      dailyEditorialPlan: {} as NonNullable<ReaderSummaryModelInput["dailyEditorialPlan"]>,
      evidence: {
        ...input.evidence,
        dailyGenerationInput: {} as NonNullable<ReaderSummaryModelInput["evidence"]["dailyGenerationInput"]>,
      },
    };
    for (const provider of ["agent-runtime", "openai-responses"] as const) {
      const route = { ...originalRoute, provider };
      expect(withReaderSummaryInputPromptVersion(route, editorialInput)).toEqual({
        ...route,
        promptVersion: "reader_summary.prompt.2026-11-03.daily_editorial_v1",
      });
    }
  });
});
