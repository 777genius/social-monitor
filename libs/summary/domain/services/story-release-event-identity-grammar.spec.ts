import { samePrimaryReleaseEvent, storyReleaseEventIdentity } from "./story-release-event-identity";
import { releaseEvidence } from "./story-release-event-identity.spec-support";

const announce = (body: string, target = "Juniper 2.8", publisher = "Northstar") => releaseEvidence(
  `${publisher} launches ${target} for coding\n${body}`,
);
const original = announce("Northstar releases Juniper 2.8 on September 1. Lower cost for coding.");

describe("bounded source corroboration and release grammar", () => {
  it.each([
    "Researchers at Cedar Labs measured the model on 400 coding tasks.",
    "Juniper 2.8 was benchmarked by Cedar using 400 coding tasks.",
    "A fresh benchmark of coding workloads was run by Cedar using 400 tasks.",
    "Cedar ran a new coding benchmark.",
    "A benchmark of Juniper 2.8 was run by Cedar using 400 tasks.",
    "These measurements were performed after the announcement.",
    "Northstar measured the model, but Cedar measured it again after the release.",
    "Cedar measured it; a benchmark was run by Northstar.",
  ])("declines new third-party or unattributed measurements: %s", (detail) => {
    const item = announce(`Northstar releases Juniper 2.8 on September 1. ${detail}`);
    expect(storyReleaseEventIdentity(item)).toBeUndefined();
  });

  it.each([
    "Northstar measured the model on 400 coding tasks.",
    "Northstar has benchmarked the model on 400 coding tasks.",
    "A fresh benchmark was run by Northstar using 400 coding tasks.",
    "Juniper 2.8 was tested by Northstar on coding tasks.",
    "Juniper 2.8 improves coding benchmarks (says Northstar). Partner quotes describe reliable work.",
  ])("keeps publisher measurements and descriptive release results: %s", (detail) => {
    expect(samePrimaryReleaseEvent(original,
      announce(`Northstar releases Juniper 2.8 on September 1. ${detail}`))).toBe(true);
  });

  it.each([
    "", "Some news about coding workloads.",
    "Juniper 2.8", "Juniper 2.8\nJuniper 2.8 improves coding workloads.",
    "Maple 4.6 is now available for coding. Benchmarks improve vs Juniper 2.8.",
    "Juniper 2.8\nElsewhere releases Juniper 2.8. Juniper 2.8 is GA.",
    "Juniper 2.8\nJuniper 2.8 is available (says Elsewhere).",
  ])("does not trust an uncorroborated or conflicting headline: %s", (body) => {
    expect(storyReleaseEventIdentity(announce(body))).toBeUndefined();
  });

  it("uses a complete versioned source header with independent availability evidence", () => {
    const item = announce("**Juniper 2.8 / Maple 4.6 (Sept 2026)**\n\nSame model, different safeguards. Juniper 2.8 is GA; Maple 4.6 only via trusted access. Benchmark gains describe coding results.", "Juniper 2.8 and Maple 4.6");
    expect(storyReleaseEventIdentity(item)).toMatchObject({
      publisher: "northstar", targets: ["juniper@2.8", "maple@4.6"], eventDate: "2026-09",
    });
    expect(storyReleaseEventIdentity({ ...item, sourceText: item.sourceText!.replace("Maple 4.6 (", "Maple 4.7 (") })).toBeUndefined();
    expect(storyReleaseEventIdentity({ ...item, sourceText: undefined, bodyPreview: undefined })).toBeUndefined();
  });

  it.each([", ", ", and ", " and ", " / "])("keeps coordinated objects with %s", (separator) => {
    const target = `Juniper 2.8${separator}Maple 4.6`;
    const item = announce(`Northstar releases ${target}, its most capable models for coding.`, target);
    expect(storyReleaseEventIdentity(item)?.targets).toEqual(["juniper@2.8", "maple@4.6"]);
    expect(samePrimaryReleaseEvent(original, item)).toBe(true);
  });

  it.each(["Juniper 2.8,", "Juniper 2.8, Maple", "Juniper 2.8, a detector", "Juniper 2.8,, Maple 4.6"])(
    "fails closed on ambiguous object continuation: %s", (target) => {
      expect(storyReleaseEventIdentity(announce(`Northstar releases ${target}.`, target))).toBeUndefined();
    },
  );

  it.each(["Juniper 2.8", "It", "This model"])("binds a passive date to %s", (subject) => {
    const body = `Northstar releases Juniper 2.8. ${subject} was released on September 1, 2026.`;
    expect(storyReleaseEventIdentity(announce(body))?.eventDate).toBe("2026-09-01");
    expect(samePrimaryReleaseEvent(original, announce(body))).toBe(true);
    expect(samePrimaryReleaseEvent(original, announce(body.replace("September", "August")))).toBe(false);
  });

  it.each(["Juniper 2.8 is in beta preview.", "It is a beta preview.", "This model is in early access."])(
    "binds stage without relying on a release noun: %s", (detail) => {
      const item = announce(`Northstar releases Juniper 2.8 on September 1. ${detail}`);
      expect(storyReleaseEventIdentity(item)?.stage).toBe("preview");
      expect(samePrimaryReleaseEvent(original, item)).toBe(false);
    },
  );

  it("rejects contradictory dates on the same subject", () => {
    expect(storyReleaseEventIdentity(announce("Northstar releases Juniper 2.8 on September 1. It was released on August 1, 2026."))).toBeUndefined();
  });

  it("does not attach another model's date or preview to this release", () => {
    const body = "Northstar releases Juniper 2.8 on September 1. Maple 4.6 was released on August 1, 2026. Maple 4.6 is in beta preview.";
    expect(storyReleaseEventIdentity(announce(body))).toMatchObject({ stage: "release", eventDate: "2026-09-01" });
    // A pronoun after a different subject has insufficient primary attachment.
    expect(storyReleaseEventIdentity(announce(`${body} It was released on August 2, 2026.`))).toBeUndefined();
  });

  it("declines explicitly future release detail", () => {
    expect(storyReleaseEventIdentity(announce("Northstar releases Juniper 2.8 on September 1. This release will ship next month."))).toBeUndefined();
  });
});
