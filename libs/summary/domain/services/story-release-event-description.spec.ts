import { samePrimaryReleaseEvent } from "./story-release-event-identity";
import { releaseDescriptionCases } from "./story-release-event-description.spec-support";

describe("release context binds descriptions and preserves independent assertions", () => {
  it.each(releaseDescriptionCases)("$name", ({ inputs, mayMerge }) => {
    expect(samePrimaryReleaseEvent(inputs[0]!, inputs[1]!)).toBe(mayMerge);
    expect(samePrimaryReleaseEvent(inputs[0]!, { ...inputs[1]!, sourceText: undefined })).toBe(mayMerge);
  });
});
