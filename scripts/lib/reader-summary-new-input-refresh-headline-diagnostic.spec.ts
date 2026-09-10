import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-policy.repository";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import type { ReaderSummaryEvidenceSelectorPort } from "@social-monitor/summary/ports";
import { executeNewInputRefresh } from "./reader-summary-new-input-refresh-execution";
import * as postgres from "./reader-summary-new-input-refresh-postgres";
import * as capture from "./reader-summary-new-input-refresh-capture";
import * as composition from "./reader-summary-daily-story-relation-verifier";
import { NewInputRefreshGuard } from "./reader-summary-new-input-refresh-guard";
import { pairedFixture } from "./reader-summary-new-input-refresh-paired-export.spec-support";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";

// Actual refresh entry and rank/assessment composition, with inert authority and
// a job harness that stops after selection. No publication, SQL or native IO.
describe("fresh refresh headline diagnostic reachability", () => {
  afterEach(() => jest.restoreAllMocks());

  it("uses the reserved root and consumed job on the same model pass; failed reservation writes nothing", async () => {
    const run = async (mode: "off" | "reserved" | "existing") => {
      const fixture = pairedFixture({ capture: false, supplemental: 0, response: (command) => {
        const { candidates } = JSON.parse(command.prompt);
        return { reviews: candidates.map((c: { candidateId: string; bindingId: string; untrustedSource: { bodyPreview: string } }) => ({
          candidateId: c.candidateId, bindingId: c.bindingId, decision: "promote", confidence: 0.96,
          qualityScore: 0.85, interestRelevanceScore: 0.95, engagementIntegrityScore: 0.95,
          flags: [], reason: "Synthetic parser result", resolvedSoftFlags: [],
          evidence: [{ field: "bodyPreview", start: 0, end: c.untrustedSource.bodyPreview.length, quote: c.untrustedSource.bodyPreview }],
        })) };
      } });
      const manifest = refreshManifest();
      const diagnosticPath = join(fixture.path, "headline-diagnostic.json");
      if (mode === "existing") {
        mkdirSync(fixture.path, { mode: 0o700 });
        writeFileSync(join(fixture.path, "sentinel"), "untouched");
      }
      const jobId = "synthetic-consumed-refresh-job";
      jest.spyOn(postgres, "readRefreshCounts").mockResolvedValue({ publications: 1, outbox: 1, jobs: 1, artifacts: 1 });
      jest.spyOn(postgres, "readRefreshPrior").mockResolvedValue(manifest.prior);
      jest.spyOn(postgres, "readRefreshJobs").mockResolvedValue([]);
      jest.spyOn(postgres, "readRefreshReconciliations").mockResolvedValue([]);
      jest.spyOn(capture, "captureRefreshAuthority").mockResolvedValue(manifest.authority);
      jest.spyOn(capture, "assertRefreshHasNewInput").mockResolvedValue();
      jest.spyOn(PrismaReaderSummaryPolicyRepository.prototype, "findByScope").mockResolvedValue({ toSnapshot: () => ({}) } as never);
      jest.spyOn(RequestReaderSummaryUseCase.prototype, "execute").mockResolvedValue({ ok: true,
        value: { created: true, readerSummaryJobId: jobId } } as never);
      jest.spyOn(NewInputRefreshGuard.prototype, "assertCurrent").mockResolvedValue();
      jest.spyOn(NewInputRefreshGuard.prototype, "selector").mockImplementation((selector) => selector);
      let selection: unknown;
      const terminal = new Error("synthetic stop after selection");
      jest.spyOn(ExecuteReaderSummaryJobUseCase.prototype, "execute").mockImplementation(async function (this: ExecuteReaderSummaryJobUseCase) {
        selection = await (this as unknown as { evidenceSelector: ReaderSummaryEvidenceSelectorPort }).evidenceSelector.select(fixture.query);
        throw terminal;
      });
      const realComposition = composition.createReaderSummaryDailyCapturePublicationWiring;
      let persistence: Promise<void> | undefined;
      const persist = jest.fn((path: string, bytes: string, signal: AbortSignal) =>
        (persistence = writeFile(path, bytes, { flag: "wx", mode: 0o600, signal })));
      const wiring = jest.spyOn(composition, "createReaderSummaryDailyCapturePublicationWiring")
        .mockImplementation((input) => realComposition({ ...input, headlineDiagnosticPersist: persist }));
      try {
        await expect(executeNewInputRefresh({ manifest, ...(mode === "off" ? {} : { capturePath: fixture.path }),
          summary: {} as never, feed: fixture.feed, configuredInterests: fixture.interests, clock: fixture.clock,
          env: {}, runtime: fixture.delegate, assertFences: () => undefined, assertSource: () => undefined,
          assertRuntime: async () => undefined, record: () => undefined })).rejects.toBe(terminal);
        await persistence;
        expect(wiring).toHaveBeenCalledTimes(1);
        if (mode === "reserved") {
          expect(wiring.mock.calls[0]![0].headlineDiagnosticArtifact).toEqual({ path: diagnosticPath, attemptId: jobId });
          expect(persist).toHaveBeenCalledTimes(1);
          const rows = JSON.parse(readFileSync(diagnosticPath, "utf8"));
          expect(rows.length).toBeGreaterThan(0);
          const scopeHash = createHash("sha256").update(JSON.stringify([manifest.tenantId, manifest.workspaceId, jobId])).digest("hex");
          expect(rows.every((row: { scopeHash: string }) => row.scopeHash === scopeHash)).toBe(true);
        } else {
          expect(wiring.mock.calls[0]![0].headlineDiagnosticArtifact).toBeUndefined();
          expect(persist).not.toHaveBeenCalled();
          expect(existsSync(diagnosticPath)).toBe(false);
          if (mode === "existing") expect(readFileSync(join(fixture.path, "sentinel"), "utf8")).toBe("untouched");
        }
        return { selection, modelCalls: fixture.delegate.runTask.mock.calls.length,
          modelPurposes: fixture.delegate.runTask.mock.calls.map(([command]) => command.purpose) };
      } finally {
        jest.restoreAllMocks();
        rmSync(fixture.parent!, { recursive: true, force: true });
      }
    };
    const plain = await run("off");
    expect(plain.modelCalls).toBeGreaterThan(0);
    expect(await run("reserved")).toEqual(plain);
    expect(await run("existing")).toEqual(plain);
  });
});
