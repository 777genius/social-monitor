import {
  DatasetGuardedReaderSummaryEvidenceSelector,
  ReaderSummaryDayDatasetGuard,
  completeDatasetGuardPhases,
  datasetManifestLifetimePolicy,
} from "./reader-summary-day-dataset-guard";
import { captureReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-manifest";

const generatedAt = new Date("2026-09-16T00:00:00.000Z");
const admissionAgeMs = 1800_000;
const operationMs = 11760_000;

async function fixture(retained = false) {
  let now = generatedAt.getTime() + admissionAgeMs;
  const client = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn(async () => 0),
  };
  const manifest = await captureReaderSummaryDayDatasetManifest({
    client: client as never,
    tenantId: "33333333-3333-4333-8333-333333333333",
    workspaceId: "44444444-4444-4444-8444-444444444444",
    startedAt: new Date("2026-09-10T00:00:00.000Z"),
    endedAt: new Date("2026-09-11T00:00:00.000Z"),
    generatedAt,
    ...(retained ? { retainedAuthorityBoundThrough: generatedAt } : {}),
  });
  const newGuard = () => new ReaderSummaryDayDatasetGuard(
    client as never, manifest, "f".repeat(64), () => new Date(now),
  );
  client.$queryRaw.mockClear();
  return { client, manifest, guard: newGuard(), newGuard,
    advance: (ms: number) => { now += ms; } };
}

it.each([false, true])("survives 15 serial batches, generation and locked publication (retained=%s)", async (retained) => {
  const test = await fixture(retained);
  await test.guard.assertCurrentBeforeMutation();
  const delegate = { select: jest.fn(async () => {
    for (let batch = 0; batch < 15; batch++) {
      await Promise.resolve();
      test.advance(240_000); // Entire supported 3600-second assessment budget.
    }
    return { items: [] };
  }) };
  const selector = new DatasetGuardedReaderSummaryEvidenceSelector(delegate as never, test.guard, true);
  await selector.select({} as never);
  expect(delegate.select).toHaveBeenCalledTimes(1);
  test.advance(operationMs - 3600_000); // Generation + remaining bounded work.
  await test.guard.assertCurrentBeforeMutation();
  test.client.$queryRaw.mockClear();
  test.client.$executeRaw.mockImplementation(async () => {
    expect(test.client.$queryRaw).not.toHaveBeenCalled();
    return 0;
  });
  await test.guard.assertCurrentForPublicationTransaction(test.client as never);
  expect(test.guard.evidence()).toMatchObject({
    lifetimePolicy: datasetManifestLifetimePolicy,
    admittedAt: "2026-09-16T00:30:00.000Z",
    validatedAt: "2026-09-16T03:46:00.000Z",
    completedPhases: completeDatasetGuardPhases,
  });
  // A transaction retry must retain the original deadline.
  test.advance(1);
  test.client.$queryRaw.mockClear();
  await expect(test.guard.assertCurrentForPublicationTransaction(test.client as never))
    .rejects.toThrow("stale at before_publication");
});

it.each([1, -admissionAgeMs - 1, NaN])("rejects invalid initial admission offset %s", async (offset) => {
  const test = await fixture();
  test.advance(offset);
  await expect(test.guard.assertCurrentBeforeMutation()).rejects.toThrow("stale");
  expect(test.client.$queryRaw).not.toHaveBeenCalled();
  expect(test.guard.evidence().admittedAt).toBeNull();
});

it("does not carry admission across a new guard or reset it at a later phase", async () => {
  const test = await fixture();
  await test.guard.assertCurrentBeforeMutation();
  test.advance(3600_000);
  await expect(test.newGuard().assertCurrentBeforeMutation()).rejects.toThrow("stale");
  await test.guard.assertCurrent("before_evidence_selection");
  test.advance(operationMs - 3600_000 + 1);
  await expect(test.guard.assertCurrent("after_evidence_selection")).rejects.toThrow("stale");
  await expect(test.guard.assertCurrentBeforeMutation()).rejects.toThrow("stale");
});

it("rejects backward clock movement after admission", async () => {
  const test = await fixture();
  await test.guard.assertCurrentBeforeMutation();
  test.advance(-1);
  await expect(test.guard.assertCurrentBeforeMutation()).rejects.toThrow("stale");
});

it.each(["after_evidence_selection", "before_mutation", "before_publication"] as const)(
  "still rejects dataset drift after long-running work at %s", async (phase) => {
    const test = await fixture();
    await test.guard.assertCurrent("before_evidence_selection");
    if (phase === "before_publication") await test.guard.assertCurrent("after_evidence_selection");
    test.advance(3600_000);
    test.client.$queryRaw.mockResolvedValue([{ providerKey: "reddit", rowJson: "changed" }]);
    const check = phase === "before_publication"
      ? test.guard.assertCurrentForPublicationTransaction(test.client as never)
      : phase === "before_mutation" ? test.guard.assertCurrentBeforeMutation()
        : test.guard.assertCurrent(phase);
    await expect(check).rejects.toThrow("dataset changed");
    expect(test.guard.evidence().completedPhases).not.toContain("before_publication");
    if (phase === "before_publication") expect(test.client.$executeRaw).toHaveBeenCalledTimes(1);
  },
);

it("checks the deadline again after database revalidation", async () => {
  const test = await fixture();
  await test.guard.assertCurrent("before_evidence_selection");
  test.advance(operationMs);
  test.client.$queryRaw.mockImplementation(async () => {
    test.advance(1);
    return [];
  });
  await expect(test.guard.assertCurrent("after_evidence_selection")).rejects.toThrow("stale");
});

it("does not grant an operation window when admission's dataset check fails", async () => {
  const test = await fixture();
  test.client.$queryRaw.mockResolvedValue([{ providerKey: "reddit", rowJson: "changed" }]);
  await expect(test.guard.assertCurrentBeforeMutation()).rejects.toThrow("dataset changed");
  expect(test.guard.evidence().admittedAt).toBeNull();
  test.client.$queryRaw.mockResolvedValue([]);
  test.advance(1);
  await expect(test.guard.assertCurrentBeforeMutation()).rejects.toThrow("stale");
});


it("anchors admission before the first dataset read without extending its deadline", async () => {
  const test = await fixture(); // Fresh at the inclusive 30-minute boundary.
  test.client.$queryRaw.mockImplementation(async () => {
    test.advance(1);
    return [];
  });
  await test.guard.assertCurrentBeforeMutation();
  expect(test.guard.evidence()).toMatchObject({
    admittedAt: "2026-09-16T00:30:00.000Z",
    validatedAt: "2026-09-16T00:30:00.002Z",
  });
  test.advance(operationMs);
  await expect(test.guard.assertCurrentBeforeMutation()).rejects.toThrow("stale");
});
