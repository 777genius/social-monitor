import type {
  AgentRuntimeClientPort,
} from "../../libs/summary/ports/agent-runtime-client.port";
import type {
  ReaderSummaryWeeklyReviewManifestPort,
} from "../../libs/summary/ports/reader-summary-weekly-review-manifest.port";

import {
  admitReaderSummaryWeeklyReviewManifest,
} from "./reader-summary-weekly-review-admission";
import {
  completeDbState,
  reviewManifestFor,
} from "./reader-summary-weekly-production-test-fixture";

describe("reader summary weekly review admission", () => {
  it("uses only findBySeal during explicit replay", async () => {
    const dbState = completeDbState();
    const manifest = reviewManifestFor(dbState);
    const manifestStore = fakeManifestStore(manifest);
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState,
      replay: true,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toMatchObject({
      status: "complete",
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(manifestStore.findBySeal).toHaveBeenCalledTimes(1);
    expect(manifestStore.persist).not.toHaveBeenCalled();
    expect(runtime.runTask).not.toHaveBeenCalled();
  });

  it("fails closed on a missing replay manifest without provider or write calls", async () => {
    const manifestStore = fakeManifestStore(null);
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState: completeDbState(),
      replay: true,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toMatchObject({
      status: "partial",
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(manifestStore.findBySeal).toHaveBeenCalledTimes(1);
    expect(manifestStore.persist).not.toHaveBeenCalled();
    expect(runtime.runTask).not.toHaveBeenCalled();
  });

  it("fails closed on a corrupt replay manifest without provider or write calls", async () => {
    const dbState = completeDbState();
    const manifest = reviewManifestFor(dbState);
    const corrupt = Object.freeze({ ...manifest, canonicalJson: "{}" });
    const manifestStore = fakeManifestStore(corrupt);
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState,
      replay: true,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toMatchObject({
      status: "partial",
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(manifestStore.findBySeal).toHaveBeenCalledTimes(1);
    expect(manifestStore.persist).not.toHaveBeenCalled();
    expect(runtime.runTask).not.toHaveBeenCalled();
  });

  it("reuses an authorized normal manifest without invoking its provider", async () => {
    const dbState = completeDbState();
    const manifestStore = fakeManifestStore(reviewManifestFor(dbState));
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState,
      replay: false,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toMatchObject({
      status: "complete",
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(manifestStore.findBySeal).toHaveBeenCalledTimes(1);
    expect(manifestStore.persist).not.toHaveBeenCalled();
    expect(runtime.runTask).not.toHaveBeenCalled();
  });

  it("fails closed on an authority-mismatched manifest without producer writes", async () => {
    const dbState = completeDbState();
    const manifest = reviewManifestFor(dbState);
    const mismatched = Object.freeze({ ...manifest, tenantId: "other-tenant" });
    const manifestStore = fakeManifestStore(mismatched);
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState,
      replay: false,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toMatchObject({
      status: "partial",
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(manifestStore.persist).not.toHaveBeenCalled();
    expect(runtime.runTask).not.toHaveBeenCalled();
  });
});

const fakeManifestStore = (
  manifest: ReturnType<typeof reviewManifestFor> | null,
): jest.Mocked<ReaderSummaryWeeklyReviewManifestPort> => ({
  findBySeal: jest.fn(async () => manifest),
  persist: jest.fn(async () => {
    throw new Error("review admission attempted a manifest write");
  }),
});

const fakeRuntime = (): jest.Mocked<AgentRuntimeClientPort> => ({
  runTask: jest.fn(async () => {
    throw new Error("review admission attempted a provider call");
  }),
  checkHealth: jest.fn(async () => ({
    status: "serving",
    runtimeEngine: "fixture",
    runtimeVersion: "fixture",
    warnings: [],
  })),
});
