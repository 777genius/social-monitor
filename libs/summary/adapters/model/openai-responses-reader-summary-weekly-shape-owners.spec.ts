import {
  legacyOutputKeys,
  expandedLegacyOutputKeys,
  expandedLegacyStoryKeys,
  expandedLegacySectionKeys,
  expandedLegacySectionKeysWithoutClaimType,
  legacySectionKeys,
  legacySectionKeysWithoutTakeaway,
} from "./openai-responses-reader-summary-weekly-legacy-shape-keys";
import {
  sealedCompactOutputKeys,
  sealedCompactStoryKeys,
  sealedCompactStoryKeysWithHeadline,
} from "./openai-responses-reader-summary-weekly-sealed-shape-keys";
import * as historical from "./openai-responses-reader-summary-weekly-response-shapes";
import { hasExactKeys } from "./openai-responses-reader-summary-weekly-shape-validation";

describe("versioned weekly wire exact-key admission owners", () => {
  it("retains all historical public array identities and the exact original order", () => {
    const owned = {
      legacyOutputKeys, expandedLegacyOutputKeys, expandedLegacyStoryKeys,
      expandedLegacySectionKeys, expandedLegacySectionKeysWithoutClaimType,
      legacySectionKeys, legacySectionKeysWithoutTakeaway,
      sealedCompactOutputKeys, sealedCompactStoryKeys,
      sealedCompactStoryKeysWithHeadline,
    };
    for (const [key, value] of Object.entries(owned)) {
      expect(historical[key as keyof typeof historical]).toBe(value);
    }
    expect(legacyOutputKeys).toEqual([
      "schemaVersion", "sealId", "sealSha", "weekStartedOn", "weekEndedOn",
      "observedFrom", "observedThrough", "headline", "takeaway", "synthesis",
      "citationIds", "sections",
    ]);
    expect(expandedLegacyOutputKeys).toEqual([
      "schemaVersion", "sealId", "sealSha", "weekStartedOn", "weekEndedOn",
      "headline", "takeaway", "synthesis", "claimType", "citationIds",
      "observedFrom", "observedThrough", "stories", "sections",
    ]);
    expect(sealedCompactOutputKeys).toEqual([
      "schemaVersion", "sealId", "sealSha", "weekStartedOn", "weekEndedOn",
      "headline", "takeaway", "synthesis", "citationIds", "observedFrom",
      "observedThrough", "stories", "sections",
    ]);
  });

  it("rejects cross-version envelopes and extra keys without changing validation", () => {
    const fromKeys = (keys: readonly string[]) =>
      Object.fromEntries(keys.map(key => [key, null]));
    const legacy = fromKeys(legacyOutputKeys);
    const expanded = fromKeys(expandedLegacyOutputKeys);
    const sealed = fromKeys(sealedCompactOutputKeys);
    expect(hasExactKeys(legacy, legacyOutputKeys)).toBe(true);
    expect(hasExactKeys(expanded, expandedLegacyOutputKeys)).toBe(true);
    expect(hasExactKeys(sealed, sealedCompactOutputKeys)).toBe(true);
    expect(hasExactKeys(sealed, expandedLegacyOutputKeys)).toBe(false);
    expect(hasExactKeys(expanded, sealedCompactOutputKeys)).toBe(false);
    expect(hasExactKeys(sealed, legacyOutputKeys)).toBe(false);
    expect(hasExactKeys({ ...sealed, extra: "untrusted" }, sealedCompactOutputKeys)).toBe(false);
    expect(hasExactKeys({ ...expanded, extra: "untrusted" }, expandedLegacyOutputKeys)).toBe(false);
  });
});
