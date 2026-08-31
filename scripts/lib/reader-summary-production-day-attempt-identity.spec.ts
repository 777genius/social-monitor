import {
  readerSummaryProductionDayArtifactPolicyVersion,
  readerSummaryProductionDayAttemptIdentity,
  readerSummaryProductionDayIdempotencyKey,
  type ReaderSummaryProductionDayAttemptIdentityInput,
} from "./reader-summary-production-day-attempt-identity";

const liveIdentity = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000002",
  periodKey:
    "daily:2026-08-13T00:00:00.000Z:2026-08-14T00:00:00.000Z:UTC",
  servingAuthority: {
    summaryGenerator: {
      mode: "agent-runtime",
      provider: "codex",
      physicalModel: "gpt-5.6-sol",
      reasoningPolicy: "high",
    },
    topicLabeler: {
      mode: "agent-runtime",
      provider: "codex",
      physicalModel: "gpt-5.6-sol",
      reasoningPolicy: "high",
    },
    topicRelationVerifier: {
      mode: "agent-runtime",
      provider: "codex",
      physicalModel: "gpt-5.6-sol",
      reasoningPolicy: "high",
    },
    storyRelationVerifier: {
      mode: "agent-runtime",
      provider: "codex",
      physicalModel: "gpt-5.6-sol",
      reasoningPolicy: "high",
    },
    runtime: {
      engine: "subscription-runtime-cli",
      packageVersion: "1.2.3",
      launcherSha256: "f".repeat(64),
    },
  },
  sourceProvenance: { kind: "live-production" },
} satisfies ReaderSummaryProductionDayAttemptIdentityInput;

const regenerationIdentity = {
  ...liveIdentity,
  sourceProvenance: {
    kind: "historical-regeneration",
    sourceAuthority: {
      kind: "preserved-production-day-report",
      sourceReportSha256: "a".repeat(64),
      collectionArtifactSha256: "b".repeat(64),
      collectionQualityReportSha256: "c".repeat(64),
    },
    datasetManifestSha256: "d".repeat(64),
    timestampPolicy: "published_at",
  },
} satisfies ReaderSummaryProductionDayAttemptIdentityInput;

const authorityHashFields = [
  "sourceReportSha256",
  "collectionArtifactSha256",
  "collectionQualityReportSha256",
  "datasetManifestSha256",
] as const;

describe("reader summary production-day attempt identity", () => {
  it("binds retries to the current persisted artifact policy", () => {
    expect(readerSummaryProductionDayArtifactPolicyVersion).toBe(
      "reader_summary.artifact_policy.v9",
    );
  });

  it("preserves the stable natural-day identity", () => {
    const identity = readerSummaryProductionDayAttemptIdentity(liveIdentity);

    expect(identity).toMatch(/^[0-9a-f]{64}$/u);
    expect(readerSummaryProductionDayAttemptIdentity(liveIdentity)).toBe(
      identity,
    );
    expect(readerSummaryProductionDayIdempotencyKey(identity)).toBe(
      `durable-reader-summary-daily:${identity}`,
    );
  });

  it("isolates rolling live snapshots by observation cutoff", () => {
    const first = {
      ...liveIdentity,
      sourceProvenance: {
        kind: "live-production",
        observationCutoff: "2026-08-13T08:15:00.000Z",
      },
    } satisfies ReaderSummaryProductionDayAttemptIdentityInput;
    const second = {
      ...first,
      sourceProvenance: {
        ...first.sourceProvenance,
        observationCutoff: "2026-08-13T12:15:00.000Z",
      },
    } satisfies ReaderSummaryProductionDayAttemptIdentityInput;

    expect(readerSummaryProductionDayAttemptIdentity(first)).not.toBe(
      readerSummaryProductionDayAttemptIdentity(second),
    );
  });

  it("rejects a non-canonical rolling observation cutoff", () => {
    expect(() => readerSummaryProductionDayAttemptIdentity({
      ...liveIdentity,
      sourceProvenance: {
        kind: "live-production",
        observationCutoff: "2026-08-13T08:15:00Z",
      },
    })).toThrow("observation cutoff is invalid");
  });

  it("produces the same regeneration identity for identical authority", () => {
    expect(
      readerSummaryProductionDayAttemptIdentity(regenerationIdentity),
    ).toBe(readerSummaryProductionDayAttemptIdentity(regenerationIdentity));
  });

  it.each(authorityHashFields)(
    "changes regeneration identity when %s changes",
    (field) => {
      const changed = {
        ...regenerationIdentity,
        sourceProvenance: {
          ...regenerationIdentity.sourceProvenance,
          ...(field === "datasetManifestSha256"
            ? { [field]: "e".repeat(64) }
            : {
                sourceAuthority: {
                  ...regenerationIdentity.sourceProvenance.sourceAuthority,
                  [field]: "e".repeat(64),
                },
              }),
        },
      } satisfies ReaderSummaryProductionDayAttemptIdentityInput;

      expect(readerSummaryProductionDayAttemptIdentity(changed)).not.toBe(
        readerSummaryProductionDayAttemptIdentity(regenerationIdentity),
      );
    },
  );

  it("binds Promotion V2 rebuild authority into attempt and job identity", () => {
    const promoted = {
      ...regenerationIdentity,
      sourceProvenance: {
        ...regenerationIdentity.sourceProvenance,
        promotionRebuild: {
          rebuildIdentity: "1".repeat(64),
          authoritativeInputDigest: "2".repeat(64),
          policyVersion: "reader_post_promotion.v2" as const,
          sourceAuthorityKind: "preserved-production-day-report" as const,
          sourcePublicationId: "00000000-0000-4000-8000-000000000101",
          sourceArtifactId: "00000000-0000-4000-8000-000000000101",
          sourcePublicationReportSha256: "4".repeat(64),
          sourcePublicationProofSha256: "3".repeat(64),
        },
      },
    } satisfies ReaderSummaryProductionDayAttemptIdentityInput;
    const attempt = readerSummaryProductionDayAttemptIdentity(promoted);

    expect(attempt).not.toBe(
      readerSummaryProductionDayAttemptIdentity(regenerationIdentity),
    );
    expect(readerSummaryProductionDayIdempotencyKey(
      attempt,
      promoted.sourceProvenance.promotionRebuild.rebuildIdentity,
    )).toBe(
      `durable-reader-summary-daily-promotion-v2:${"1".repeat(64)}`,
    );
  });

  it.each(authorityHashFields)(
    "fails closed when %s is absent",
    (field) => {
      const incompleteMode: Partial<typeof regenerationIdentity.sourceProvenance> = {
        ...regenerationIdentity.sourceProvenance,
      };
      if (field === "datasetManifestSha256") {
        delete incompleteMode[field];
      } else {
        const sourceAuthority: Partial<
          typeof regenerationIdentity.sourceProvenance.sourceAuthority
        > = { ...regenerationIdentity.sourceProvenance.sourceAuthority };
        delete sourceAuthority[field];
        incompleteMode.sourceAuthority = sourceAuthority as never;
      }

      expect(() =>
        readerSummaryProductionDayAttemptIdentity({
          ...regenerationIdentity,
          sourceProvenance: incompleteMode,
        } as ReaderSummaryProductionDayAttemptIdentityInput),
      ).toThrow("Reader summary production-day SHA-256 is invalid");
    },
  );

  it.each([
    ["summary model", { summaryGenerator: {
      ...liveIdentity.servingAuthority.summaryGenerator,
      physicalModel: "gpt-5.7",
    } }],
    ["topic-labeler model", { topicLabeler: {
      ...liveIdentity.servingAuthority.topicLabeler,
      physicalModel: "changed-topic-labeler",
    } }],
    ["topic-relation model", { topicRelationVerifier: {
      ...liveIdentity.servingAuthority.topicRelationVerifier,
      physicalModel: "changed-topic-relation-verifier",
    } }],
    ["story-relation model", { storyRelationVerifier: {
      ...liveIdentity.servingAuthority.storyRelationVerifier,
      physicalModel: "changed-story-relation-verifier",
    } }],
    ["provider", { summaryGenerator: {
      ...liveIdentity.servingAuthority.summaryGenerator,
      provider: "claude",
    } }],
    ["reasoning policy", { summaryGenerator: {
      ...liveIdentity.servingAuthority.summaryGenerator,
      reasoningPolicy: "xhigh",
    } }],
    ["runtime engine", { runtime: {
      ...liveIdentity.servingAuthority.runtime!,
      engine: "subscription-runtime-cli-v2",
    } }],
    ["runtime package", { runtime: {
      ...liveIdentity.servingAuthority.runtime!,
      packageVersion: "1.2.4",
    } }],
    ["launcher", { runtime: {
      ...liveIdentity.servingAuthority.runtime!,
      launcherSha256: "e".repeat(64),
    } }],
  ] as const)("changes the key and recovery path identity when %s changes", (_field, change) => {
    const changed = readerSummaryProductionDayAttemptIdentity({
      ...liveIdentity,
      servingAuthority: { ...liveIdentity.servingAuthority, ...change },
    });
    const original = readerSummaryProductionDayAttemptIdentity(liveIdentity);

    expect(changed).not.toBe(original);
    expect(readerSummaryProductionDayIdempotencyKey(changed)).not.toBe(
      readerSummaryProductionDayIdempotencyKey(original),
    );
  });

  it("keeps persisted source provenance separate from current authority", () => {
    const persisted = {
      ...liveIdentity,
      sourceProvenance: {
        kind: "persisted-daily-replay",
        sourceAuthoritySha256: "a".repeat(64),
        originalModelJobIdentity: "b".repeat(64),
        originalReceiptSha256: "c".repeat(64),
      },
    } satisfies ReaderSummaryProductionDayAttemptIdentityInput;

    expect(readerSummaryProductionDayAttemptIdentity(persisted)).toBe(
      readerSummaryProductionDayAttemptIdentity(persisted),
    );
    expect(readerSummaryProductionDayAttemptIdentity({
      ...persisted,
      servingAuthority: {
        ...persisted.servingAuthority,
        runtime: {
          ...persisted.servingAuthority.runtime!,
          packageVersion: "2.0.0",
        },
      },
    })).not.toBe(readerSummaryProductionDayAttemptIdentity(persisted));
  });

  it("changes mixed OpenAI-summary identity for either agent topic model", () => {
    const mixed = {
      ...liveIdentity,
      servingAuthority: {
        ...liveIdentity.servingAuthority,
        summaryGenerator: {
          mode: "openai-responses" as const,
          provider: "openai-responses",
          physicalModel: "gpt-5.4-mini",
          reasoningPolicy: "not-applicable",
        },
      },
    } satisfies ReaderSummaryProductionDayAttemptIdentityInput;
    const original = readerSummaryProductionDayAttemptIdentity(mixed);

    expect(readerSummaryProductionDayAttemptIdentity({
      ...mixed,
      servingAuthority: {
        ...mixed.servingAuthority,
        topicLabeler: {
          ...mixed.servingAuthority.topicLabeler,
          physicalModel: "changed-labeler",
        },
      },
    })).not.toBe(original);
    expect(readerSummaryProductionDayAttemptIdentity({
      ...mixed,
      servingAuthority: {
        ...mixed.servingAuthority,
        topicRelationVerifier: {
          ...mixed.servingAuthority.topicRelationVerifier,
          physicalModel: "changed-relation-verifier",
        },
      },
    })).not.toBe(original);
  });
});
