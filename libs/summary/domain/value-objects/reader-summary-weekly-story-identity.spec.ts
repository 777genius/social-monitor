import {
  assertReaderSummaryWeeklyCanonicalStoryIdentity,
  deriveReaderSummaryWeeklyStoryIdentity,
  readerSummaryWeeklyStoryIdentityBinding,
} from "./reader-summary-weekly-story-identity";

describe("reader summary weekly story identity", () => {
  const reviewedSemantics = {
    subjectKey: "product:openai/codex",
    actionKey: "action:release",
    objectKeys: ["capability:agent", "interface:cli"],
    qualifierKeys: ["audience:developer", "stage:public-beta"],
  } as const;

  it("is stable across weeks, ordering, prose, timestamps and observations", () => {
    const first = deriveReaderSummaryWeeklyStoryIdentity(reviewedSemantics);
    const laterWeek = deriveReaderSummaryWeeklyStoryIdentity({
      subjectKey: reviewedSemantics.subjectKey,
      actionKey: reviewedSemantics.actionKey,
      objectKeys: [...reviewedSemantics.objectKeys].reverse(),
      qualifierKeys: [...reviewedSemantics.qualifierKeys].reverse(),
    });

    expect(laterWeek.identity).toBe(first.identity);
    expect(laterWeek.sha256).toBe(first.sha256);
    expect(laterWeek.canonicalJson).toBe(first.canonicalJson);
    expect(laterWeek.toBytes()).toEqual(first.toBytes());
    expect(Object.keys(JSON.parse(first.canonicalJson))).toEqual([
      "actionKey",
      "objectKeys",
      "qualifierKeys",
      "schemaVersion",
      "subjectKey",
    ]);
    expect(first.canonicalJson).not.toMatch(
      /2026-|headline|displayTitle|timestamp|observedAt|publishedAt/iu,
    );

    for (const unreviewed of [
      { weekStartedUtcDate: "2026-07-06" },
      { displayTitle: "Codex ships a new agent" },
      { publishedAt: "2026-07-06T08:00:00.000Z" },
      { observations: ["daily:2026-07-06"] },
    ]) {
      expect(() =>
        deriveReaderSummaryWeeklyStoryIdentity({
          ...reviewedSemantics,
          ...unreviewed,
        } as never),
      ).toThrow("must contain exactly");
    }
  });

  it.each([
    ["subject", { subjectKey: "product:other" }],
    ["action", { actionKey: "action:acquisition" }],
    ["object", { objectKeys: ["capability:review"] }],
    ["qualifier", { qualifierKeys: ["stage:general-availability"] }],
  ] as const)("diverges for a different reviewed %s semantic", (_name, change) => {
    const baseline = deriveReaderSummaryWeeklyStoryIdentity(reviewedSemantics);
    const divergent = deriveReaderSummaryWeeklyStoryIdentity({
      ...reviewedSemantics,
      ...change,
    });

    expect(divergent.identity).not.toBe(baseline.identity);
    expect(divergent.sha256).not.toBe(baseline.sha256);
  });

  it("rejects ambiguity, role collisions and temporal identity smuggling", () => {
    expect(() =>
      deriveReaderSummaryWeeklyStoryIdentity({
        ...reviewedSemantics,
        objectKeys: ["capability:agent", "capability:agent"],
      }),
    ).toThrow("object keys is ambiguous");
    expect(() =>
      deriveReaderSummaryWeeklyStoryIdentity({
        ...reviewedSemantics,
        qualifierKeys: [reviewedSemantics.actionKey],
      }),
    ).toThrow("semantic role collision");

    for (const key of [
      "Action:release",
      "action:release ",
      "week:2026-w30",
      "observed-at:2026-07-06",
      "event:2026-07-06",
      "evidence:citation-17",
      "observation:source-1",
      "publication:daily-42",
      "source-item:provider-99",
      "résumé:release",
    ]) {
      expect(() =>
        deriveReaderSummaryWeeklyStoryIdentity({
          ...reviewedSemantics,
          actionKey: key,
        }),
      ).toThrow("stable canonical semantic key");
    }
  });

  it("has deterministic immutable value semantics and rejects forged seals", () => {
    const first = deriveReaderSummaryWeeklyStoryIdentity(reviewedSemantics);
    const replay = deriveReaderSummaryWeeklyStoryIdentity({
      qualifierKeys: reviewedSemantics.qualifierKeys,
      objectKeys: reviewedSemantics.objectKeys,
      actionKey: reviewedSemantics.actionKey,
      subjectKey: reviewedSemantics.subjectKey,
    });
    const bytes = first.toBytes();
    bytes[0] = 0;

    expect(replay.toBytes()).toEqual(first.toBytes());
    expect(first.toBytes()).not.toEqual(bytes);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.objectKeys)).toBe(true);
    expect(Object.isFrozen(readerSummaryWeeklyStoryIdentityBinding(first))).toBe(
      true,
    );
    expect(() =>
      assertReaderSummaryWeeklyCanonicalStoryIdentity({
        ...first,
        sha256: "f".repeat(64),
      }),
    ).toThrow("seal is invalid");
  });
});
