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
  mode: { kind: "live-production" },
} satisfies ReaderSummaryProductionDayAttemptIdentityInput;

const regenerationIdentity = {
  ...liveIdentity,
  mode: {
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

    expect(identity).toBe(
      "c669ebf1734b48f02f5a15a8ced891bead3877b317d87abfc0163ad1d6f8b4f9",
    );
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
        mode: {
          ...regenerationIdentity.mode,
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
      const incompleteMode: Partial<typeof regenerationIdentity.mode> = {
        ...regenerationIdentity.mode,
      };
      delete incompleteMode[field];

      expect(() =>
        readerSummaryProductionDayAttemptIdentity({
          ...regenerationIdentity,
          mode: incompleteMode,
        } as ReaderSummaryProductionDayAttemptIdentityInput),
      ).toThrow("Reader summary production-day SHA-256 is invalid");
    },
  );
});
