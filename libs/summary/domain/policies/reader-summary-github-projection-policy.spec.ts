import {
  notApplicableReaderSummaryGitHubProjectionAudit,
  readerSummaryHasVerifiedGitHubProjection,
  readerSummaryGitHubProjectionCollectionGraceMs,
  readerSummaryGitHubProjectionCollectionWarningThresholdMs,
} from "./reader-summary-github-projection-policy";
import {
  artifactWithoutGitHubEvidence,
  evaluateGitHubProjection as evaluate,
  githubBoardArtifact as boardArtifact,
  githubProjectionInput as projectionInput,
  githubProjectionItem as projectionItem,
} from "./reader-summary-github-projection-policy.spec-support";

const projectionDayEndedAt = new Date("2026-07-11T00:00:00.000Z");

describe("reader summary GitHub projection policy", () => {
  it("verifies one exact durable rank #1 through #10 board and records fingerprints", () => {
    const artifact = boardArtifact();
    const evaluation = evaluate(artifact, projectionInput());

    expect(evaluation.findings).toEqual([]);
    expect(evaluation.audit).toMatchObject({
      status: "verified",
      requestedUtcDay: "2026-07-10",
      pageCount: 2,
      scannedItemCount: 10,
      eligibleBindingIds: ["github-binding-a"],
      projectionCheckedAt: "2026-07-10T12:00:00.000Z",
    });
    expect(evaluation.audit.bindings).toHaveLength(10);
    expect(evaluation.audit.bindings.map((binding) => binding.rank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(evaluation.audit.bindings[0]).toMatchObject({
      feedItemId: "github-feed-1",
      sourceItemId: "github-source-1",
      sourceBindingId: "github-binding-a",
      repositoryIdentity: "owner/repo-1",
      sourceContentHash: "a".repeat(64),
      sourceProviderContentHash: "b".repeat(64),
    });
    expect(
      readerSummaryHasVerifiedGitHubProjection({
        artifact,
        audit: evaluation.audit,
      }),
    ).toBe(true);
  });

  it("allows editorial selectedPosts outside the canonical GitHub board", () => {
    const artifact = boardArtifact({ includeEditorialSelectedPost: true });
    const evaluation = evaluate(artifact, projectionInput());

    expect(evaluation.audit.status).toBe("verified");
    expect(evaluation.audit.bindings).toHaveLength(10);
    expect(
      readerSummaryHasVerifiedGitHubProjection({
        artifact,
        audit: evaluation.audit,
      }),
    ).toBe(true);
  });

  it("verifies ranks #1 through #10 plus one eligible rank #12 Watch item", () => {
    const artifact = boardArtifact({ watchRank: 12, watchStarsGained: 1_001 });
    const evaluation = evaluate(artifact, [
      ...projectionInput(),
      projectionItem(12, { starsGained: 1_001 }),
    ]);

    expect(evaluation.audit.status).toBe("verified");
    expect(evaluation.audit.scannedItemCount).toBe(11);
    expect(evaluation.audit.bindings).toHaveLength(10);
    expect(
      artifact
        .toSnapshot()
        .content?.narrativeSections?.filter((section) =>
          section.kind === "watch",
        ),
    ).toHaveLength(1);
  });

  it("verifies a rank #11 at the threshold without adding it to Watch", () => {
    const artifact = boardArtifact();
    const evaluation = evaluate(artifact, [
      ...projectionInput(),
      projectionItem(11, { starsGained: 1_000 }),
    ]);

    expect(evaluation.audit.status).toBe("verified");
    expect(evaluation.audit.scannedItemCount).toBe(11);
    expect(
      artifact
        .toSnapshot()
        .content?.narrativeSections?.some((section) =>
          section.kind === "watch",
        ),
    ).toBe(false);
  });

  it("fails closed on malformed or duplicate projection extras", () => {
    const malformed = {
      ...projectionItem(11, { starsGained: 1_001 }),
      repositoryFullName: "other/repository",
    };
    const duplicateRank = projectionItem(11, {
      identityPrefix: "other/repository",
      idPrefix: "other-extra",
      starsGained: 1_002,
    });
    const malformedEvaluation = evaluate(boardArtifact(), [
      ...projectionInput(),
      malformed,
    ]);
    const duplicateEvaluation = evaluate(boardArtifact(), [
      ...projectionInput(),
      projectionItem(11, { starsGained: 1_001 }),
      duplicateRank,
    ]);

    expect(malformedEvaluation.audit.violationCodes).toContain(
      "github_projection_identity_invalid",
    );
    expect(duplicateEvaluation.audit.violationCodes).toContain(
      "github_projection_duplicate",
    );
  });

  it("rejects a zero board instead of treating GitHub citations as optional", () => {
    const evaluation = evaluate(boardArtifact({ selectedPostCount: 0 }), []);

    expect(evaluation.audit.status).toBe("rejected");
    expect(evaluation.audit.violationCodes).toContain(
      "github_projection_missing",
    );
  });

  it("rejects a partial selectedPosts board when an eligible binding exists", () => {
    const evaluation = evaluate(
      boardArtifact({ selectedPostCount: 5 }),
      projectionInput(),
    );

    expect(evaluation.audit.status).toBe("rejected");
    expect(evaluation.audit.violationCodes).toContain(
      "github_projection_missing",
    );
  });

  it.each(["missing", "divergent"] as const)(
    "rejects two eligible bindings when the second board is %s",
    (secondBoard) => {
      const secondItems =
        secondBoard === "missing"
          ? []
          : Array.from({ length: 10 }, (_, index) =>
              projectionItem(index + 1, {
                sourceBindingId: "github-binding-b",
                identityPrefix: "other/repository",
                idPrefix: "other-github",
              }),
            );
      const evaluation = evaluate(
        boardArtifact(),
        [...projectionInput(), ...secondItems],
        ["github-binding-a", "github-binding-b"],
      );

      expect(evaluation.audit.status).toBe("rejected");
      expect(evaluation.audit.eligibleBindingIds).toEqual([
        "github-binding-a",
        "github-binding-b",
      ]);
      expect(evaluation.audit.violationCodes).toContain(
        "github_projection_ambiguous",
      );
      if (secondBoard === "missing") {
        expect(evaluation.audit.violationCodes).toContain(
          "github_projection_missing",
        );
      }
    },
  );

  it("rejects a daily artifact with no GitHub evidence when its canonical binding is missing", () => {
    const artifact = artifactWithoutGitHubEvidence();
    const evaluation = evaluate(artifact, [], []);

    expect(evaluation.audit).toMatchObject({
      status: "rejected",
      eligibleBindingIds: [],
      pageCount: 2,
      scannedItemCount: 0,
      violationCodes: ["github_projection_missing"],
    });
    expect(
      readerSummaryHasVerifiedGitHubProjection({
        artifact,
        audit: evaluation.audit,
      }),
    ).toBe(false);
  });

  it("permits not_required for an explicit non-daily one-day scope", () => {
    const artifact = artifactWithoutGitHubEvidence({
      cadence: "custom",
      startedAt: new Date("2026-07-10T00:00:00.000Z"),
      endedAt: new Date("2026-07-11T00:00:00.000Z"),
      periodKey: "custom:2026-07-10:UTC",
    });
    const evaluation = evaluate(artifact, [], []);

    expect(evaluation.audit).toMatchObject({
      status: "not_required",
      eligibleBindingIds: [],
      pageCount: 2,
      scannedItemCount: 0,
    });
    expect(
      readerSummaryHasVerifiedGitHubProjection({
        artifact,
        audit: evaluation.audit,
      }),
    ).toBe(true);
  });

  it("does not apply the daily board to a non-daily artifact without GitHub evidence", () => {
    const artifact = artifactWithoutGitHubEvidence({
      cadence: "weekly",
      startedAt: new Date("2026-07-06T00:00:00.000Z"),
      endedAt: new Date("2026-07-13T00:00:00.000Z"),
      periodKey: "weekly:2026-07-06:UTC",
    });
    const evaluation = notApplicableReaderSummaryGitHubProjectionAudit({
      artifact,
    });

    expect(evaluation.audit).toMatchObject({
      status: "not_applicable",
      requestedUtcDay: "weekly:2026-07-06:UTC",
      pageCount: 0,
    });
    expect(
      readerSummaryHasVerifiedGitHubProjection({
        artifact,
        audit: evaluation.audit,
      }),
    ).toBe(true);
  });

  it("rejects duplicate and gapped durable ranks", () => {
    const duplicate = {
      ...projectionItem(11),
      rank: 1,
      canonicalUrl: "https://github.com/other/duplicate-rank",
      repositoryFullName: "other/duplicate-rank",
    };
    const duplicated = evaluate(boardArtifact(), [
      ...projectionInput(),
      duplicate,
    ]);
    const gapped = evaluate(boardArtifact(), projectionInput().slice(0, 9));

    expect(duplicated.audit.violationCodes).toEqual(
      expect.arrayContaining([
        "github_projection_duplicate",
        "github_projection_mixed",
      ]),
    );
    expect(gapped.audit.violationCodes).toEqual(
      expect.arrayContaining([
        "github_projection_gapped",
        "github_projection_identity_invalid",
      ]),
    );
  });

  it("rejects selected posts mixed across projection snapshots", () => {
    const items = projectionInput().map((item, index) => ({
      ...item,
      checkedAt:
        index < 5
          ? new Date("2026-07-10T12:00:00.000Z")
          : new Date("2026-07-10T13:00:00.000Z"),
    }));

    const evaluation = evaluate(boardArtifact(), items);

    expect(evaluation.audit.violationCodes).toContain(
      "github_projection_mixed",
    );
  });

  it("rejects a complete older snapshot when a newer binding snapshot exists", () => {
    const selectedSnapshot = projectionInput();
    const newerSnapshot = Array.from({ length: 10 }, (_, index) =>
      projectionItem(index + 1, {
        identityPrefix: "new-owner/new-repo",
        idPrefix: "new-github",
        checkedAt: new Date("2026-07-10T13:00:00.000Z"),
        observedAt: new Date("2026-07-10T13:05:00.000Z"),
      }),
    );

    const evaluation = evaluate(boardArtifact(), [
      ...selectedSnapshot,
      ...newerSnapshot,
    ]);

    expect(evaluation.audit.violationCodes).toContain(
      "github_projection_stale",
    );
  });

  it("uses checkedAt rather than a late observation to choose the canonical board", () => {
    const selectedSnapshot = projectionInput({
      checkedAt: new Date("2026-07-10T13:00:00.000Z"),
      observedAt: new Date("2026-07-10T13:05:00.000Z"),
    });
    const lateOlderSnapshot = Array.from({ length: 10 }, (_, index) =>
      projectionItem(index + 1, {
        identityPrefix: "old-owner/old-repo",
        idPrefix: "old-github",
        checkedAt: new Date("2026-07-10T12:00:00.000Z"),
        observedAt: new Date("2026-07-10T14:00:00.000Z"),
      }),
    );

    const evaluation = evaluate(boardArtifact(), [
      ...selectedSnapshot,
      ...lateOlderSnapshot,
    ]);

    expect(evaluation.audit.status).toBe("verified");
  });

  it("validates the coherent latest snapshot without rejecting stale invalid history", () => {
    const dayStartedAt = new Date("2026-07-21T00:00:00.000Z");
    const dayEndedAt = new Date("2026-07-22T00:00:00.000Z");
    const staleCheckedAt = new Date("2026-07-21T11:20:21.000Z");
    const latestCheckedAt = new Date("2026-07-22T00:00:35.000Z");
    const latestObservedAt = new Date("2026-07-22T00:00:35.250Z");
    const staleInvalidHistory = Array.from({ length: 21 }, (_, index) =>
      projectionItem(index + 1, {
        identityPrefix: "stale-owner/stale-repo",
        idPrefix: "stale-github",
        publishedAt: staleCheckedAt,
        checkedAt: staleCheckedAt,
        observedAt: new Date("2026-07-21T00:00:34.000Z"),
      }),
    );
    const coherentLatest = Array.from({ length: 21 }, (_, index) =>
      projectionItem(index + 1, {
        publishedAt: new Date("2026-07-21T23:59:59.999Z"),
        checkedAt: latestCheckedAt,
        observedAt: latestObservedAt,
      }),
    );

    const evaluation = evaluate(
      boardArtifact({ dayStartedAt, dayEndedAt }),
      [...staleInvalidHistory, ...coherentLatest],
      ["github-binding-a"],
      latestObservedAt,
    );

    expect(evaluation.findings).toEqual([]);
    expect(evaluation.audit).toMatchObject({
      status: "verified",
      scannedItemCount: 42,
      projectionCheckedAt: latestCheckedAt.toISOString(),
    });
    expect(evaluation.audit.bindings.map((binding) => binding.rank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(
      evaluation.audit.bindings.map((binding) => binding.feedItemId),
    ).toEqual(
      Array.from({ length: 10 }, (_, index) => `github-feed-${index + 1}`),
    );
  });

  it("rejects an incoherent latest snapshot instead of falling back to coherent history", () => {
    const coherentHistory = Array.from({ length: 21 }, (_, index) =>
      projectionItem(index + 1),
    );
    const incoherentLatest = Array.from({ length: 21 }, (_, index) =>
      projectionItem(index + 1, {
        identityPrefix: "latest-owner/latest-repo",
        idPrefix: "latest-github",
        checkedAt: new Date("2026-07-10T13:00:00.000Z"),
        publishedAt: new Date("2026-07-10T13:00:00.000Z"),
        observedAt: new Date("2026-07-10T12:59:59.999Z"),
      }),
    );

    const evaluation = evaluate(boardArtifact(), [
      ...coherentHistory,
      ...incoherentLatest,
    ]);

    expect(evaluation.audit.status).toBe("rejected");
    expect(evaluation.audit.violationCodes).toEqual(
      expect.arrayContaining([
        "github_projection_identity_invalid",
        "github_projection_stale",
      ]),
    );
  });

  it("accepts the real post-midnight batch by its requested publishedAt day", () => {
    const dayStartedAt = new Date("2026-07-16T00:00:00.000Z");
    const dayEndedAt = new Date("2026-07-17T00:00:00.000Z");
    const publishedAt = new Date("2026-07-16T23:59:59.999Z");
    const checkedAt = new Date("2026-07-17T00:00:24.278Z");
    const observedAt = new Date("2026-07-17T00:00:24.435Z");
    const artifact = boardArtifact({ dayStartedAt, dayEndedAt });
    const evaluation = evaluate(
      artifact,
      projectionInput({ publishedAt, checkedAt, observedAt }),
      ["github-binding-a"],
      observedAt,
    );

    expect(evaluation.findings).toEqual([]);
    expect(evaluation.audit).toMatchObject({
      status: "verified",
      requestedUtcDay: "2026-07-16",
      projectionCheckedAt: checkedAt.toISOString(),
      observedThrough: observedAt.toISOString(),
      telemetry: {
        github_projection_collection_delay_ms: 24_435,
        collectionGraceMs: 300_000,
        warningThresholdMs: 240_000,
        qualitySignal: "within_grace",
      },
    });
    expect(evaluation.audit.bindings[0]).toMatchObject({
      publishedAt: publishedAt.toISOString(),
      checkedAt: checkedAt.toISOString(),
      observedAt: observedAt.toISOString(),
    });
    expect(
      readerSummaryHasVerifiedGitHubProjection({
        artifact,
        audit: evaluation.audit,
      }),
    ).toBe(true);
  });

  it.each([
    [299_999, "verified"],
    [300_000, "verified"],
    [300_001, "rejected"],
  ] as const)(
    "applies the inclusive 300-second post-midnight grace at %dms",
    (delayMs, expectedStatus) => {
      const collectedAt = new Date(
        projectionDayEndedAt.getTime() + delayMs,
      );
      const evaluation = evaluate(
        boardArtifact(),
        projectionInput({
          publishedAt: new Date("2026-07-10T23:59:59.999Z"),
          checkedAt: collectedAt,
          observedAt: collectedAt,
        }),
        ["github-binding-a"],
        collectedAt,
      );

      expect(evaluation.audit.status).toBe(expectedStatus);
      if (expectedStatus === "verified") {
        expect(
          evaluation.audit.telemetry
            ?.github_projection_collection_delay_ms,
        ).toBe(delayMs);
      }
    },
  );

  it("rejects a post-midnight batch beyond observedThrough", () => {
    const checkedAt = new Date("2026-07-11T00:00:24.278Z");
    const observedAt = new Date("2026-07-11T00:00:24.435Z");
    const evaluation = evaluate(
      boardArtifact(),
      projectionInput({
        publishedAt: new Date("2026-07-10T23:59:59.999Z"),
        checkedAt,
        observedAt,
      }),
      ["github-binding-a"],
      new Date("2026-07-11T00:00:24.434Z"),
    );

    expect(evaluation.audit.status).toBe("rejected");
    expect(evaluation.audit.violationCodes).toContain(
      "github_projection_identity_invalid",
    );
  });

  it.each([
    [
      readerSummaryGitHubProjectionCollectionWarningThresholdMs - 1,
      "within_grace",
    ],
    [
      readerSummaryGitHubProjectionCollectionWarningThresholdMs,
      "github_projection_collection_delay_warning",
    ],
  ] as const)(
    "emits collection delay quality signal at %dms: %s",
    (delayMs, qualitySignal) => {
      const collectedAt = new Date(
        projectionDayEndedAt.getTime() + delayMs,
      );
      const evaluation = evaluate(
        boardArtifact(),
        projectionInput({
          publishedAt: new Date("2026-07-10T23:59:59.999Z"),
          checkedAt: collectedAt,
          observedAt: collectedAt,
        }),
        ["github-binding-a"],
        collectedAt,
      );

      expect(evaluation.audit).toMatchObject({
        status: "verified",
        telemetry: {
          github_projection_collection_delay_ms: delayMs,
          collectionGraceMs:
            readerSummaryGitHubProjectionCollectionGraceMs,
          warningThresholdMs:
            readerSummaryGitHubProjectionCollectionWarningThresholdMs,
          qualitySignal,
        },
      });
    },
  );

  it("rejects future, cross-day, and replayed projection data", () => {
    const baseItems = projectionInput();
    const future = evaluate(
      boardArtifact(),
      projectionInput({
        checkedAt: new Date("2026-07-10T12:00:24.278Z"),
        observedAt: new Date("2026-07-10T12:00:24.435Z"),
      }),
      ["github-binding-a"],
      new Date("2026-07-10T12:00:24.300Z"),
    );
    const crossDay = evaluate(
      boardArtifact(),
      projectionInput({
        publishedAt: new Date("2026-07-11T00:00:00.000Z"),
      }),
    );
    const replayed = evaluate(boardArtifact(), [...baseItems, ...baseItems]);

    for (const evaluation of [future, crossDay, replayed]) {
      expect(evaluation.audit.status).toBe("rejected");
    }
    expect(replayed.audit.violationCodes).toContain(
      "github_projection_duplicate",
    );
  });

  it.each([
    "https://user@github.com/owner/repo-1",
    "https://user:secret@github.com/owner/repo-1",
    "https://github.com:443/owner/repo-1",
    "https://github.com/owner/repo-1/",
    "https://github.com//owner/repo-1",
    "https://github.com/owner/./repo-1",
  ])("rejects non-canonical GitHub identity %s", (canonicalUrl) => {
    const evaluation = evaluate(
      boardArtifact({ firstCanonicalUrl: canonicalUrl }),
      projectionInput({ firstCanonicalUrl: canonicalUrl }),
    );

    expect(evaluation.audit.violationCodes).toContain(
      "github_projection_identity_invalid",
    );
  });

  it.each([
    ["2026-07-10T00:00:00.000Z", "verified"],
    ["2026-07-10T23:59:59.999Z", "verified"],
    ["2026-07-09T23:59:59.999Z", "rejected"],
    ["2026-07-11T00:00:00.000Z", "verified"],
  ] as const)(
    "treats checkedAt boundary %s as %s",
    (checkedAt, expectedStatus) => {
      const checkedAtDate = new Date(checkedAt);
      const publishedAt = new Date(
        Math.min(
          checkedAtDate.getTime(),
          Date.parse("2026-07-10T11:55:00.000Z"),
        ),
      );
      const observedAt = new Date(
        Math.max(
          checkedAtDate.getTime(),
          Date.parse("2026-07-10T12:05:00.000Z"),
        ),
      );
      const evaluation = evaluate(
        boardArtifact(),
        projectionInput({ publishedAt, checkedAt: checkedAtDate, observedAt }),
      );

      expect(evaluation.audit.status).toBe(expectedStatus);
      if (expectedStatus === "rejected") {
        expect(evaluation.audit.violationCodes).toContain(
          "github_projection_identity_invalid",
        );
      }
    },
  );

  it("rejects a projection checked before its published business-day item", () => {
    const evaluation = evaluate(
      boardArtifact(),
      projectionInput({
        publishedAt: new Date("2026-07-10T12:00:00.000Z"),
        checkedAt: new Date("2026-07-10T11:59:59.999Z"),
      }),
    );

    expect(evaluation.audit.status).toBe("rejected");
    expect(evaluation.audit.violationCodes).toContain(
      "github_projection_identity_invalid",
    );
  });

  it("requires the artifact period itself to name UTC", () => {
    const evaluation = evaluate(
      boardArtifact({ timezone: "America/Los_Angeles" }),
      projectionInput(),
    );

    expect(evaluation.audit.violationCodes).toEqual([
      "github_projection_day_invalid",
    ]);
  });

  it("rejects a selected post that carries any extra citation identity", () => {
    const evaluation = evaluate(
      boardArtifact({ firstSelectedPostHasExtraCitation: true }),
      projectionInput(),
    );

    expect(evaluation.audit.violationCodes).toContain(
      "github_projection_identity_invalid",
    );
  });

  it("requires both durable source item fingerprints", () => {
    const items = projectionInput().map((item, index) =>
      index === 0 ? { ...item, sourceProviderContentHash: "" } : item,
    );

    const evaluation = evaluate(boardArtifact(), items);

    expect(evaluation.audit.violationCodes).toContain(
      "github_projection_identity_invalid",
    );
  });

  it("does not accept a forged verified audit for another UTC day", () => {
    const artifact = boardArtifact();
    const evaluation = evaluate(artifact, projectionInput());

    expect(
      readerSummaryHasVerifiedGitHubProjection({
        artifact,
        audit: {
          ...evaluation.audit,
          requestedUtcDay: "2026-07-09",
        },
      }),
    ).toBe(false);
  });

  it("does not accept forged collection delay telemetry", () => {
    const artifact = boardArtifact();
    const evaluation = evaluate(artifact, projectionInput());

    expect(
      readerSummaryHasVerifiedGitHubProjection({
        artifact,
        audit: {
          ...evaluation.audit,
          telemetry: {
            ...evaluation.audit.telemetry!,
            github_projection_collection_delay_ms: 1,
          },
        },
      }),
    ).toBe(false);
  });

  it("does not accept a verified audit whose durable identity differs from its citation", () => {
    const artifact = boardArtifact();
    const evaluation = evaluate(artifact, projectionInput());
    const firstBinding = evaluation.audit.bindings[0]!;

    expect(
      readerSummaryHasVerifiedGitHubProjection({
        artifact,
        audit: {
          ...evaluation.audit,
          bindings: [
            { ...firstBinding, feedItemId: "forged-feed-item" },
            ...evaluation.audit.bindings.slice(1),
          ],
        },
      }),
    ).toBe(false);
  });
});
