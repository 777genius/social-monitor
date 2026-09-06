import { storyReleaseEventIdentity, samePrimaryReleaseEvent } from "./story-release-event-identity";
import { releaseEvidence } from "./story-release-event-identity.spec-support";
import { primaryEventReviewCases } from "./story-release-event-primary.spec-support";
import { primaryEventGrammarCases } from "./story-release-event-primary-grammar.spec-support";

describe("primary event assertions use all available body evidence", () => {
  it.each(primaryEventReviewCases)("preserves full source and preview fallback: $name", ({ inputs }) => {
    const items = inputs.map((input) => ({ ...input,
      publishedAt: new Date(input.publishedAt), observedAt: new Date(input.observedAt),
    }));
    const [left, right] = items;
    expect(samePrimaryReleaseEvent(left!, right!)).toBe(false);
    expect(samePrimaryReleaseEvent(left!, { ...right!, sourceText: undefined })).toBe(false);
    expect(samePrimaryReleaseEvent(left!, { ...right!, bodyPreview: left!.bodyPreview })).toBe(false);
  });

  it.each(primaryEventGrammarCases)("checks adjacent subject/predicate grammar: $name", ({ inputs, mayMerge }) => {
    expect(samePrimaryReleaseEvent(inputs[0]!, inputs[1]!)).toBe(mayMerge);
    expect(samePrimaryReleaseEvent(inputs[0]!, { ...inputs[1]!, sourceText: undefined })).toBe(mayMerge);
  });

  it("does not manufacture event proof from a launch headline without body evidence", () => {
    const item = releaseEvidence("Northstar launches Juniper 2.8 for coding");
    expect(storyReleaseEventIdentity(item)).toBeUndefined();
    expect(storyReleaseEventIdentity({ ...item, sourceText: undefined, bodyPreview: undefined })).toBeUndefined();
  });
});
