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
    summaryModelMode: "agent-runtime",
    topicLabelerMode: "agent-runtime",
    provider: "codex",
    physicalModel: "gpt-5.6-sol",
    reasoningEffort: "xhigh",
    runtimeEngine: "subscription-runtime-cli",
    runtimePackageVersion: "1.2.3",
    launcherSha256: "f".repeat(64),
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
    ["summaryModelMode", "deterministic"],
    ["topicLabelerMode", "deterministic"],
    ["provider", "claude"],
    ["physicalModel", "gpt-5.7"],
    ["reasoningEffort", "high"],
    ["runtimeEngine", "subscription-runtime-cli-v2"],
    ["runtimePackageVersion", "1.2.4"],
    ["launcherSha256", "e".repeat(64)],
  ] as const)("changes the key and recovery path identity when %s changes", (field, value) => {
    const changed = readerSummaryProductionDayAttemptIdentity({
      ...liveIdentity,
      servingAuthority: { ...liveIdentity.servingAuthority, [field]: value },
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
        runtimePackageVersion: "2.0.0",
      },
    })).not.toBe(readerSummaryProductionDayAttemptIdentity(persisted));
  });
});
