import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import {
  citedRange,
  exactLegacyCitationRange,
  exactLegacyClaimType,
  legacyClaimTypeFromStories,
} from "./openai-responses-reader-summary-weekly-legacy-evidence-policy";

const input = {
  citations: [
    { citationId: "citation:early", observedOn: "2026-07-20" },
    { citationId: "citation:late", observedOn: "2026-07-26" },
  ],
} as unknown as ReaderSummaryWeeklyModelInput;

describe("weekly legacy evidence trust policy", () => {
  it("derives chronology solely from cited evidence, independently of input order", () => {
    const ids = ["citation:late", "citation:early"];
    expect(citedRange(input, ids)).toEqual({
      observedFrom: "2026-07-20",
      observedThrough: "2026-07-26",
    });
    expect(exactLegacyCitationRange(input, {
      citationIds: ids,
      observedFrom: "2026-07-20",
      observedThrough: "2026-07-26",
    }, "legacy section")).toEqual(ids);
    expect(ids).toEqual(["citation:late", "citation:early"]);
  });

  it("rejects unknown citations, fabricated dates and malformed citation arrays", () => {
    expect(() => citedRange(input, ["citation:missing"])).toThrow(
      "Legacy weekly output cites unknown evidence",
    );
    expect(() => exactLegacyCitationRange(input, {
      citationIds: ["citation:early"],
      observedFrom: "2026-07-21",
      observedThrough: "2026-07-21",
    }, "legacy section")).toThrow("legacy section fabricates chronology");
    expect(() => exactLegacyCitationRange(input, {
      citationIds: "citation:early",
    }, "legacy section")).toThrow("legacy section citations must be an array");
  });

  it("accepts historical claim types without broadening the enum", () => {
    for (const value of ["snapshot", "evolution", "resolution"]) {
      expect(exactLegacyClaimType(value, "weekly")).toBe(value);
    }
    for (const value of [null, "", "forecast", "SNAPSHOT"]) {
      expect(() => exactLegacyClaimType(value, "weekly")).toThrow(
        "weekly claim type is invalid",
      );
    }
  });

  it("inherits the claim from exactly one matching story", () => {
    const story = { storyId: "story:a", claimType: "snapshot" };
    expect(legacyClaimTypeFromStories([story], "story:a", "section")).toBe("snapshot");
    expect(() => legacyClaimTypeFromStories([], "story:a", "section")).toThrow("exactly one story");
    expect(() => legacyClaimTypeFromStories([story, story], "story:a", "section")).toThrow("exactly one story");
    expect(() => legacyClaimTypeFromStories([{
      storyId: "story:a", claimType: "invented",
    }], "story:a", "section")).toThrow("section claim type is invalid");
    expect(() => legacyClaimTypeFromStories(null, "story:a", "section")).toThrow(
      "must inherit its claim type from a story",
    );
  });
});
