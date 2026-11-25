import { hasUnboundReleaseAction } from "./story-release-event-clauses";
import { releaseDescriptionScope } from "./story-release-event-description";
import { releaseDescriptionAnecdoteCases, releaseDescriptionAttributedLeadCases, releaseDescriptionConjunctionCases, releaseDescriptionReviewCases, releaseDescriptionMetricListCases, releaseDescriptionWorkloadCases } from "./story-release-event-description-boundaries.spec-support";
import { samePrimaryReleaseEvent } from "./story-release-event-identity";
import { releaseDescriptionCases } from "./story-release-event-description.spec-support";

describe("release context binds descriptions and preserves independent assertions", () => {
  it.each([...releaseDescriptionCases, ...releaseDescriptionReviewCases, ...releaseDescriptionMetricListCases, ...releaseDescriptionWorkloadCases,
    ...releaseDescriptionConjunctionCases, ...releaseDescriptionAnecdoteCases, ...releaseDescriptionAttributedLeadCases])("$name", ({ inputs, mayMerge }) => {
    expect(samePrimaryReleaseEvent(inputs[0]!, inputs[1]!)).toBe(mayMerge);
    expect(samePrimaryReleaseEvent(inputs[0]!, { ...inputs[1]!, sourceText: undefined })).toBe(mayMerge);
  });
  it.each(releaseDescriptionConjunctionCases)("complete statement: $name", ({ detail, mayMerge }) => {
    expect(hasUnboundReleaseAction(detail, "northstar", true, releaseDescriptionScope(detail))).toBe(!mayMerge);
  });
});
