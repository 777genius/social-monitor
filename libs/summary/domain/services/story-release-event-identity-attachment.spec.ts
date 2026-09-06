import { samePrimaryReleaseEvent, storyReleaseEventIdentity } from "./story-release-event-identity";
import { releaseEvidence } from "./story-release-event-identity.spec-support";
import { releaseIdentityResidualCases } from "./story-release-event-identity-review.spec-support";

const announce = (detail: string) => releaseEvidence(
  `Northstar launches Juniper 2.8 for coding\nNorthstar releases Juniper 2.8. ${detail}`,
);
const september = announce("Juniper 2.8 was released on September 1, 2026.");

describe("explicit evidence needs positive attachment before a release exception", () => {
  it.each(releaseIdentityResidualCases)("complete reviewer source: $name", ({ inputs, mayMerge }) => {
    const [left, right] = inputs.map((input) => ({ ...releaseEvidence(""), ...input }));
    expect(samePrimaryReleaseEvent(left!, right!)).toBe(mayMerge);
  });

  it.each([
    "A benchmark of Juniper 2.8 was independently run by Cedar using 400 tasks.",
    "Fresh measurements of Juniper 2.8 were made by Cedar using 400 tasks.",
    "A benchmark of Juniper 2.8 has subsequently been assembled by Cedar.",
    "A benchmark of Juniper 2.8 unexpectedly emerged from Cedar's lab.",
    "Cedar gathered fresh coding measurements after the announcement.",
    "Cedar assembled a coding benchmark after the announcement.",
    "Benchmarks from Cedar contradict the release results.",
    "Juniper 2.8 was rigorously evaluated by Cedar.",
    "Northstar measured the model, and a benchmark was independently run by Cedar.",
    "Northstar measured the model; fresh measurements were assembled elsewhere.",
    "A benchmark was assembled by Cedar and measurements were made by Northstar.",
    "Northstar's announcement was quoted in a benchmark of Juniper 2.8 by Cedar.",
    "A benchmark of Juniper 2.8 was run, according to Northstar.",
  ])("declines unsupported or independent measurement grammar: %s", (detail) => {
    expect(storyReleaseEventIdentity(announce(detail))).toBeUndefined();
  });

  it.each([
    "Northstar measured the model on 400 coding tasks.",
    "A benchmark of Juniper 2.8 was run by Northstar using 400 tasks.",
    "A benchmark of Juniper 2.8 was independently run by Northstar using 400 tasks.",
    "Fresh measurements of Juniper 2.8 were made by Northstar using 400 tasks.",
    "Juniper 2.8 was tested by Northstar on coding tasks.",
  ])("preserves positively attributed publisher measurements: %s", (detail) => {
    expect(samePrimaryReleaseEvent(september, announce(detail))).toBe(true);
  });

  it.each(["Juniper 2.8", "It", "This model"])("keeps explicit stage/date signals for %s", (subject) => {
    for (const modifier of ["still", "already", "currently", "apparently", "subsequently"]) {
      const preview = announce(`${subject} is ${modifier} in beta preview.`);
      const august = announce(`${subject} was ${modifier} released on August 1, 2026.`);
      expect(storyReleaseEventIdentity(preview)?.stage).toBe("preview");
      expect(storyReleaseEventIdentity(august)?.eventDate).toBe("2026-08-01");
      expect(samePrimaryReleaseEvent(september, preview)).toBe(false);
      expect(samePrimaryReleaseEvent(september, august)).toBe(false);
    }
  });

  it.each([
    "Juniper 2.8 remains in an experimental stage.",
    "It has alpha status.",
    "It remains in closed testing.",
    "Juniper 2.8 was released on 1 September 2026.",
    "It was released on 2026/09/01.",
    "It was released two weeks ago.",
    "It was released August the first.",
    "It was released on Monday.",
    "It was released on September 1, 25.",
    "It was released on September 10–12, 2026.",
    "Its release date is not documented.",
    "In fact, Juniper 2.8 remains in beta preview.",
    "Beta preview is still ongoing.",
    "Cedar's product is now in preview.",
    "Juniper 2.8 improves beta preview workflows.",
    "This model's predecessor is still in beta preview.",
    "Juniper 2.8 is at present in beta preview.",
    "It was in fact released on August 1, 2026.",
    "Maple 4.6 is still in beta preview. It was already released on August 1, 2026.",
  ])("never turns unresolved explicit facts into defaults: %s", (detail) => {
    expect(storyReleaseEventIdentity(announce(detail))).toBeUndefined();
  });

  it("excludes positively attached other-target facts and retains matching facts", () => {
    expect(storyReleaseEventIdentity(announce("Maple 4.6 is still in beta preview. Juniper 2.8 was already released on September 1, 2026.")))
      .toMatchObject({ stage: "release", eventDate: "2026-09-01" });
    expect(storyReleaseEventIdentity(announce("Juniper 2.8 was released on September 1, 2026. It was subsequently released on August 1, 2026.")))
      .toBeUndefined();
    expect(samePrimaryReleaseEvent(september, announce("The announcement includes a service in private preview."))).toBe(true);
    expect(storyReleaseEventIdentity(announce("The announcement includes a service in private preview, but beta preview is still ongoing."))).toBeUndefined();
    const patchVersion = releaseEvidence("Northstar launches Juniper 2.8.1\nNorthstar releases Juniper 2.8.1. Juniper 2.8.1 improves coding workloads.");
    expect(storyReleaseEventIdentity(patchVersion)?.targets).toEqual(["juniper@2.8.1"]);
  });
});
