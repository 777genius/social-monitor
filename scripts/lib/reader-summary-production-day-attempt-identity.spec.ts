import {
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
      reasoningPolicy: "xhigh",
    },
    topicLabeler: {
      mode: "agent-runtime",
      provider: "codex",
      physicalModel: "agent-runtime-reader-summary-topic-labeler",
      reasoningPolicy: "runtime-default",
    },
    topicRelationVerifier: {
      mode: "agent-runtime",
      provider: "codex",
      physicalModel: "agent-runtime-reader-summary-topic-relation-verifier",
      reasoningPolicy: "runtime-default",
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
    sourceReportSha256: "a".repeat(64),
    collectionArtifactSha256: "b".repeat(64),
    collectionQualityReportSha256: "c".repeat(64),
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
          [field]: "e".repeat(64),
        },
      } satisfies ReaderSummaryProductionDayAttemptIdentityInput;

      expect(readerSummaryProductionDayAttemptIdentity(changed)).not.toBe(
        readerSummaryProductionDayAttemptIdentity(regenerationIdentity),
      );
    },
  );

  it.each(authorityHashFields)(
    "fails closed when %s is absent",
    (field) => {
      const incompleteMode: Partial<typeof regenerationIdentity.sourceProvenance> = {
        ...regenerationIdentity.sourceProvenance,
      };
      delete incompleteMode[field];

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
    ["provider", { summaryGenerator: {
      ...liveIdentity.servingAuthority.summaryGenerator,
      provider: "claude",
    } }],
    ["reasoning policy", { summaryGenerator: {
      ...liveIdentity.servingAuthority.summaryGenerator,
      reasoningPolicy: "high",
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
