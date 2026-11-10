import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import { legacyOutputKeys } from "./openai-responses-reader-summary-weekly-response-shapes";
import { normalizeLegacyWeeklyModelOutput } from "./openai-responses-reader-summary-weekly-legacy-normalization";

describe("weekly legacy output compatibility boundary", () => {
  const input = {} as ReaderSummaryWeeklyModelInput;

  it("leaves unrecognized wire shapes unchanged for the strict artifact validator", () => {
    const payload = { unexpected: "synthetic" };
    expect(normalizeLegacyWeeklyModelOutput(input, payload)).toBe(payload);
  });

  it("rejects malformed legacy citations and sections before chronology claims", () => {
    const legacy = Object.fromEntries(legacyOutputKeys.map((key) => [key, null]));
    expect(() => normalizeLegacyWeeklyModelOutput(input, legacy)).toThrow(
      "Legacy weekly output citations and sections must be arrays",
    );
  });
});
