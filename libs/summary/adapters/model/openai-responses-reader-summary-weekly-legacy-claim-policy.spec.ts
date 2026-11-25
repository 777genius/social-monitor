import {
  exactLegacyClaimType as legacyClaimType,
  legacyClaimTypeFromStories as legacyStoryClaim,
} from "./openai-responses-reader-summary-weekly-legacy-evidence-policy";
import {
  exactLegacyClaimType,
  legacyClaimTypeFromStories,
} from "./openai-responses-reader-summary-weekly-legacy-claim-policy";

describe("weekly legacy claim provenance boundary", () => {
  it("retains the exact historical re-export identity and closed claim vocabulary", () => {
    expect(legacyClaimType).toBe(exactLegacyClaimType);
    expect(legacyStoryClaim).toBe(legacyClaimTypeFromStories);
    for (const claim of ["snapshot", "evolution", "resolution"]) {
      expect(exactLegacyClaimType(claim, "section")).toBe(claim);
    }
    for (const rejected of [null, [], 1, "forecast", "SNAPSHOT", undefined]) {
      expect(() => exactLegacyClaimType(rejected, "section")).toThrow(
        "section claim type is invalid",
      );
    }
  });

  it("only inherits a claim from one exactly matching story without mutating inputs", () => {
    const story = Object.freeze({ storyId: "story:a", claimType: "evolution" });
    const unrelated = Object.freeze({ storyId: "story:b", claimType: "resolution" });
    const stories = Object.freeze([unrelated, story]);
    expect(legacyClaimTypeFromStories(stories, "story:a", "legacy section"))
      .toBe("evolution");
    expect(legacyClaimTypeFromStories(stories, "story:a", "legacy section"))
      .toBe("evolution");
    expect(stories).toEqual([unrelated, story]);
    expect(Object.isFrozen(story)).toBe(true);
  });

  it("rejects missing, duplicate, malformed and unsupported story provenance", () => {
    const matching = Object.freeze({ storyId: "story:a", claimType: "snapshot" });
    const checks: ReadonlyArray<readonly [unknown, string]> = [
      [undefined, "must inherit its claim type from a story"],
      [[], "exactly one story"],
      [[matching, matching], "exactly one story"],
      [[null, 3, { storyId: "story:b", claimType: "snapshot" }], "exactly one story"],
      [[{ storyId: "story:a", claimType: "invented" }], "claim type is invalid"],
    ];
    for (const [stories, detail] of checks) {
      expect(() => legacyClaimTypeFromStories(stories, "story:a", "legacy section"))
        .toThrow(detail);
    }
  });
});
