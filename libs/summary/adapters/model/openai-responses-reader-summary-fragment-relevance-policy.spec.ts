import { fragmentScore, sourceTerms } from "./openai-responses-reader-summary-fragment-relevance-policy";

describe("reader summary source fragment lexical relevance policy", () => {
  it("uses normalized Unicode tokens, excludes short terms and stop words", () => {
    expect([...sourceTerms("The ULTRA and enterprise foo-bar 🧪 界AI with v2")])
      .toEqual(["ultra", "enterprise", "foo", "bar"]);
    expect([...sourceTerms("SOME some SOME")]).toEqual(["some"]);
  });

  it("preserves exact overlap, qualifier boost and earlier-index tie breaker", () => {
    const terms = sourceTerms("Ultra cloud service");
    expect(fragmentScore("ULTRA cloud", terms, 0)).toBe(25);
    expect(fragmentScore("ULTRA cloud", terms, 1)).toBe(24.5);
    expect(fragmentScore("cloud service", terms, 0)).toBe(21);
    expect(fragmentScore("unrelated", terms, 0)).toBe(1);
    expect(fragmentScore("unrelated", terms, 1)).toBe(0.5);
    expect(fragmentScore("enterprise", terms, 0)).toBe(5);
    expect([...terms]).toEqual(["ultra", "cloud", "service"]);
  });

  it("returns the same score for repeated immutable inputs", () => {
    const terms = sourceTerms("Pro preview");
    const snapshot = [...terms];
    const first = fragmentScore("Pro preview", terms, 2);
    expect(fragmentScore("Pro preview", terms, 2)).toBe(first);
    expect([...terms]).toEqual(snapshot);
  });
});
