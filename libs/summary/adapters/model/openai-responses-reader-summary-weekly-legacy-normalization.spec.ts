import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import { expandedLegacyOutputKeys, legacyOutputKeys, sealedCompactOutputKeys } from "./openai-responses-reader-summary-weekly-response-shapes";
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
  it("routes malformed sealed compact payloads to their strict decoder", () => {
    const payload = Object.fromEntries(
      sealedCompactOutputKeys.map((key) => [key, null]),
    );
    expect(() => normalizeLegacyWeeklyModelOutput(input, payload)).toThrow(
      "Sealed compact weekly stories and sections must be arrays",
    );
  });

  it("routes malformed expanded legacy payloads to their strict decoder", () => {
    const payload = Object.fromEntries(
      expandedLegacyOutputKeys.map((key) => [key, null]),
    );
    expect(() => normalizeLegacyWeeklyModelOutput(input, payload)).toThrow(
      "Expanded legacy weekly stories and sections must be arrays",
    );
  });

});
