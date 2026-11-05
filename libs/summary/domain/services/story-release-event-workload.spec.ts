import { hasUnboundReleaseAction } from "./story-release-event-clauses";
import { isModelUseAnecdote, releaseDescriptionScope } from "./story-release-event-description";
import { samePrimaryReleaseEvent } from "./story-release-event-identity";
import { releaseWorkloadCases } from "./story-release-event-workload.spec-support";

describe("R10 complete workload attachment", () => {
  it.each(releaseWorkloadCases)("$name", ({ inputs, detail, mayMerge }) => {
    expect(samePrimaryReleaseEvent(inputs[0]!, inputs[1]!)).toBe(mayMerge);
    expect(samePrimaryReleaseEvent(inputs[0]!, { ...inputs[1]!, sourceText: undefined })).toBe(mayMerge);
    expect(hasUnboundReleaseAction(detail, "orion", true, releaseDescriptionScope(detail))).toBe(!mayMerge);
  });
  it.each(["", "a 900-task coding workload", "900 coding prompts", "a coding problem with unbound context"])(
    "a run prefix cannot grant anecdote permission: %s", (workload) => {
      expect(isModelUseAnecdote(`Vega ran it for 12 hours on ${workload}`)).toBe(false);
    },
  );
});
