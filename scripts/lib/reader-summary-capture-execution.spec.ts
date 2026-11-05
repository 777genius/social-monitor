import { ReaderSummaryJob } from "@social-monitor/summary/domain";
import type { ReaderSummaryPreparationManifest } from "@social-monitor/summary/domain";
import { RelevanceReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { buildOpenAiReaderSummaryPromptPayload } from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-prompt";
import { createReaderSummaryCaptureExecution } from "./reader-summary-capture-execution";
import { cutoffScenario, cutoffA, cutoffB, cutoffPeriod, cutoffScope } from
  "./reader-summary-capture-execution.spec-support";

const capturePolicy = (value?: Date) => ({ value, dailyReplayActive: false,
  recoveryActive: false, cadence: cutoffPeriod.cadence, timezone: cutoffPeriod.timezone,
  periodStartedAt: cutoffPeriod.startedAt, periodEndedAt: cutoffPeriod.endedAt, now: cutoffB });

describe("durable CLI capture execution composition", () => {
  it("carries the parsed live cutoff used by provenance into the real pipeline", async () => {
    const parsed = new Date("2026-06-26T12:00:00.000Z");
    const capture = createReaderSummaryCaptureExecution(capturePolicy(parsed));
    const provenance = { kind: "live-production", observationCutoff: capture.liveObservationCutoff!.toISOString() };
    parsed.setTime(cutoffB.getTime());
    capture.liveObservationCutoff!.setTime(cutoffB.getTime());
    const s = await cutoffScenario();
    const result = await capture.execute(s.dependencies, { ...cutoffScope, readerSummaryJobId: "cutoff-job" });
    expect(result.ok).toBe(true);
    expect(s.generate).toHaveBeenCalledTimes(1);
    expect(s.snapshotRead.mock.calls[0]?.[0].observedThrough?.toISOString()).toBe(provenance.observationCutoff);
    expect(s.generate.mock.calls[0]?.[0].evidence.sourceWindow.ingestionCutoff?.toISOString()).toBe(provenance.observationCutoff);
    expect(s.artifacts.all()[0]?.toSnapshot().sourceWindow.ingestionCutoff?.toISOString()).toBe(provenance.observationCutoff);
    expect(s.github.read.mock.calls[0]?.[0].observedThrough?.toISOString()).toBe(provenance.observationCutoff);
    expect(s.snapshotRead.mock.calls[0]?.[0].observedThrough).toEqual(cutoffA);
    // This is the concrete payload builder consumed by the attested runtime
    // command. Its slate digest material binds the same selected source window.
    const payload = JSON.parse(buildOpenAiReaderSummaryPromptPayload(s.generate.mock.calls[0]![0])) as {
      editorialSlate: { digestMaterial: string };
    };
    const material = JSON.parse(payload.editorialSlate.digestMaterial) as { sourceWindow: { ingestionCutoff: string } };
    expect(material.sourceWindow.ingestionCutoff).toBe(provenance.observationCutoff);
  });

  it("leaves absent capture cutoff on the ordinary execution clock route", async () => {
    const capture = createReaderSummaryCaptureExecution(capturePolicy());
    const s = await cutoffScenario();
    await capture.execute(s.dependencies, { ...cutoffScope, readerSummaryJobId: "cutoff-job" });
    expect(capture.liveObservationCutoff).toBeUndefined();
    expect(s.snapshotRead.mock.calls[0]?.[0].observedThrough).toEqual(cutoffB);
  });

  it.each([
    { dailyReplayActive: true }, { recoveryActive: true }, { cadence: "custom" as const },
    { value: new Date("2026-06-26T14:00:00Z") },
  ])("retains the capture route policy before composition: %s", (changes) => {
    expect(() => createReaderSummaryCaptureExecution({ ...capturePolicy(cutoffA), ...changes })).toThrow();
  });
});

describe("internal reader summary execution cutoff", () => {
  it("keeps advancing-clock selection, supplemental, model, artifact and prepublication at A", async () => {
    const s = await cutoffScenario();
    const command = { ...cutoffScope, readerSummaryJobId: "cutoff-job", observedThrough: cutoffA };
    const result = await s.execute.execute(command);
    expect(result.ok).toBe(true);
    expect(s.snapshotRead.mock.calls[0]?.[0].observedThrough).toEqual(cutoffA);
    expect(s.generate).toHaveBeenCalledTimes(1);
    const evidence = s.generate.mock.calls[0]![0].evidence;
    expect(evidence.sourceWindow.ingestionCutoff).toEqual(cutoffA);
    expect(evidence.selectedEvidence.map((item) => item.feedItemId)).toEqual(["primary-early"]);
    const supplemental = await s.selector.selectSupplemental({ ...s.select.mock.calls[0]![0] });
    expect(s.supplementalRead.mock.calls[0]?.[0].observedAtOrBefore).toEqual(cutoffA);
    expect(supplemental).toEqual([]);
    expect(s.github.read.mock.calls[0]?.[0].observedThrough).toEqual(cutoffA);
    expect(s.artifacts.all()[0]?.toSnapshot().sourceWindow.ingestionCutoff).toEqual(cutoffA);
    expect(s.artifacts.all()[0]?.toSnapshot().generatedAt).toEqual(cutoffB);
  });
});

describe("capture execution lifecycle", () => {
  it("copies the caller Date before repository suspension and isolates selector mutation", async () => {
    const observedThrough = new Date(cutoffA);
    const s = await cutoffScenario({ onLookup: () => observedThrough.setTime(cutoffB.getTime()) });
    s.select.mockImplementation(async (query) => {
      const result = await RelevanceReaderSummaryEvidenceSelector.prototype.select.call(s.selector, query);
      query.observedThrough!.setTime(cutoffB.getTime());
      return result;
    });
    const result = await s.execute.execute({ ...cutoffScope, readerSummaryJobId: "cutoff-job", observedThrough });
    expect(result.ok).toBe(true);
    expect(s.snapshotRead.mock.calls[0]?.[0].observedThrough).toEqual(cutoffA);
    expect(s.github.read.mock.calls[0]?.[0].observedThrough).toEqual(cutoffA);
    expect(s.artifacts.all()[0]?.toSnapshot().sourceWindow.ingestionCutoff).toEqual(cutoffA);
  });

  it("retains the separate ordinary selection and prepublication clock behavior when absent", async () => {
    const s = await cutoffScenario();
    await s.execute.execute({ ...cutoffScope, readerSummaryJobId: "cutoff-job" });
    expect(s.snapshotRead.mock.calls[0]?.[0].observedThrough).toEqual(cutoffB);
    expect(s.generate).toHaveBeenCalledTimes(1);
    expect(s.github.read.mock.calls[0]?.[0].observedThrough).toEqual(new Date("2026-06-26T14:00:00Z"));
    expect(s.artifacts.all()[0]?.toSnapshot().sourceWindow.ingestionCutoff).toEqual(cutoffB);
  });

  it("keeps frozen V3 evidence and prepublication at the manifest boundary without explicit input", async () => {
    const manifest: ReaderSummaryPreparationManifest = { schemaVersion: "reader_summary_preparation_manifest.v1",
      cutoffAt: "2026-06-26T12:00:00.123456Z", interestSha256: "1".repeat(64), rubricSha256: "2".repeat(64),
      inputBuilderVersion: "fixture.v1", modelConfigVersion: "fixture.v1", candidates: [] };
    const requested = ReaderSummaryJob.request({ ...cutoffScope, id: "cutoff-job", scope: { type: "workspace" },
      period: cutoffPeriod, idempotencyKey: "v3-fixture", requestedAt: cutoffA, selectionStrategy: "jev_primary_v3" });
    const running = ReaderSummaryJob.rehydrate({ ...requested.toSnapshot(), status: "running", startedAt: cutoffB, preparationReadyAt: cutoffB, preparationManifest: manifest });
    const preflight = { advance: jest.fn(async () => ({ kind: "claimed" as const, job: running, manifest })), markProviderStarted: jest.fn(async () => true) };
    const s = await cutoffScenario({ job: requested, preflight });
    const dependencies = [...s.dependencies] as ConstructorParameters<typeof ExecuteReaderSummaryJobUseCase>;
    dependencies[19] = { build: async () => ({ kind: "no_signal" }) };
    await new ExecuteReaderSummaryJobUseCase(...dependencies).execute({ ...cutoffScope, readerSummaryJobId: "cutoff-job" });
    expect(s.select).not.toHaveBeenCalled();
    expect(s.github.read.mock.calls[0]?.[0].observedThrough).toEqual(new Date(manifest.cutoffAt));
    expect(s.artifacts.all()[0]?.toSnapshot().sourceWindow.exactIngestionCutoff).toBe(manifest.cutoffAt);
  });
  it("retries provider failure with A while preserving the claim and attempt transitions", async () => {
    const s = await cutoffScenario();
    s.generate.mockImplementationOnce(async () => { throw new Error("Synthetic provider outage"); });
    const command = { ...cutoffScope, readerSummaryJobId: "cutoff-job", observedThrough: cutoffA };
    const failed = await s.execute.execute(command);
    expect(failed).toMatchObject({ ok: false, error: { code: "external.dependency_unavailable" } });
    expect((await s.jobs.findById(command))?.toSnapshot()).toMatchObject({ status: "failed" });
    const retried = await s.execute.execute(command);
    expect(retried.ok).toBe(true);
    expect(s.claim).toHaveBeenCalledTimes(2);
    expect(s.snapshotRead.mock.calls.map(([query]) => query.observedThrough)).toEqual([cutoffA, cutoffA]);
    expect(s.github.read.mock.calls[0]?.[0].observedThrough).toEqual(cutoffA);
  });

});
