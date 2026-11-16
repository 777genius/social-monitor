import {
  assertNoReaderSummaryPromptReleaseOverride as legacyAssertNoOverride,
  currentReaderSummaryPromptRelease as legacyRelease,
} from "./openai-responses-reader-summary-prompt";
import {
  assertNoReaderSummaryPromptReleaseOverride,
  currentReaderSummaryPromptRelease,
} from "./reader-summary-prompt-release-policy";

describe("reader-summary provider-neutral prompt release", () => {
  it("preserves the exact public release and function-object identity", () => {
    expect(legacyRelease).toBe(currentReaderSummaryPromptRelease);
    expect(legacyAssertNoOverride).toBe(assertNoReaderSummaryPromptReleaseOverride);
    expect(currentReaderSummaryPromptRelease).toEqual({
      id: "reader_summary.prompt.2026-08-30.immutable_editorial_slate",
      releasedOn: "2026-08-30",
      changeSummary:
        "Reader Promotion V2 Top 8 order is immutable and Additional 8 is secondary context only.",
    });
  });

  it.each([undefined, "", " ", "\n\t"])(
    "admits an absent or whitespace-only override without mutation (%s)",
    (value) => {
      const options = { environmentName: "OPENAI_READER_SUMMARY_PROMPT_VERSION", value };
      expect(() => assertNoReaderSummaryPromptReleaseOverride(options)).not.toThrow();
      expect(options.environmentName).toBe("OPENAI_READER_SUMMARY_PROMPT_VERSION");
    },
  );

  it.each(["other.release", " other.release ", "\nunsupported\n"])(
    "rejects a non-empty release override with the same fail-closed diagnostic (%s)",
    (value) => {
      expect(() =>
        assertNoReaderSummaryPromptReleaseOverride({
          environmentName: "AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION",
          value,
        }),
      ).toThrow(
        "AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION is no longer supported; the Reader Summary prompt release is owned by the compiled prompt contract",
      );
    },
  );
});
