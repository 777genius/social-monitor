import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import { normalizeSealedCompactWeeklyStory } from "./openai-responses-reader-summary-weekly-sealed-story-normalization";

// This isolated trust policy reads only the already sealed citation identities and dates.
// Full sealed-input admission remains covered by the end-to-end weekly response parser spec.
const input = Object.freeze({
  citations: Object.freeze([
    Object.freeze({ citationId: "citation:one", observedOn: "2026-07-21" }),
  ]),
}) as unknown as ReaderSummaryWeeklyModelInput;

const story = Object.freeze({
  storyId: "story:one",
  status: "snapshot",
  claimType: "snapshot",
  observedFrom: "2026-07-21",
  observedThrough: "2026-07-21",
  synthesis: "Grounded synthesis",
  citationIds: Object.freeze(["citation:one"]),
});
const sections = Object.freeze([
  Object.freeze({ storyId: "story:one", heading: "Admitted section headline" }),
]);

describe("sealed compact weekly story trust responsibility", () => {
  it("uses the admitted section heading, not an untrusted story heading, without mutating evidence", () => {
    const result = normalizeSealedCompactWeeklyStory(input, {
      ...story,
      headline: "Untrusted model headline",
    }, sections, 0);
    expect(result).toEqual({
      storyId: "story:one",
      headline: "Admitted section headline",
      summary: "Grounded synthesis",
      status: "new",
      observedFrom: "2026-07-21",
      observedThrough: "2026-07-21",
      citationIds: ["citation:one"],
    });
    expect(Object.keys(result)).toEqual([
      "storyId", "headline", "summary", "status", "observedFrom",
      "observedThrough", "citationIds",
    ]);
    expect(story.citationIds).toEqual(["citation:one"]);
    expect(sections[0]!.heading).toBe("Admitted section headline");
    expect(input.citations[0]!.citationId).toBe("citation:one");
  });

  it("rejects extra fields before evidence parsing and rejects chronology forgery", () => {
    expect(() => normalizeSealedCompactWeeklyStory(
      input, { ...story, extra: "injection" }, sections, 2,
    )).toThrow("Sealed compact weekly story 3 must contain exactly the supported fields");
    expect(() => normalizeSealedCompactWeeklyStory(
      input, { ...story, observedThrough: "2026-07-22" }, sections, 0,
    )).toThrow("sealed compact weekly story 1 fabricates chronology");
    expect(() => normalizeSealedCompactWeeklyStory(
      input, { ...story, citationIds: ["untrusted"] }, sections, 0,
    )).toThrow("Legacy weekly output cites unknown evidence");
  });

  it("requires a section headline and preserves first matching section precedence", () => {
    expect(() => normalizeSealedCompactWeeklyStory(
      input, story, [], 0,
    )).toThrow("Sealed compact weekly story 1 lacks a matching section headline");
    expect(normalizeSealedCompactWeeklyStory(input, story, [
      { storyId: "story:one", heading: "First" },
      { storyId: "story:one", heading: "Second" },
    ], 0).headline).toBe("First");
  });
});
