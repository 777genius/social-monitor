import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult, ReaderSummaryPublicationCommand } from "@social-monitor/summary/ports";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { activeReaderSummaryPurposes as purposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import { guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { completedRefreshModelRequest as completed, refreshModelCommand as command } from "./reader-summary-new-input-refresh-model.spec-support";
import { NewInputRefreshGuard } from "./reader-summary-new-input-refresh-guard";
import { refreshPublicationGuard } from "./reader-summary-new-input-refresh-execution";
import { lockRefreshAuthority } from "./reader-summary-new-input-refresh-postgres";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";

const m = refreshManifest();
describe("confirmed review defects", () => {
  it.each(["model", "reasoningEffort", "requestId", "purpose", "provider", "schemaVersion", "selectedOutputSha256", "canonicalRequestSha256"])(
    "a selector catching bad %s cannot proceed to primary generation", async (field) => {
      const events: unknown[] = [];
      const runTask = jest.fn(async (request: AgentRuntimeTaskCommand) => {
        const result = await completed(request);
        return { ...result, executionAttestation: { ...result.executionAttestation!, [field]: "invalid" } } as AgentRuntimeTaskResult;
      });
      const input = { manifest: m, delegate: { runTask, checkHealth: jest.fn() },
        assertLocal: () => undefined, assertCurrent: async () => undefined, record: (event: unknown) => events.push(event) };
      const runtime = guardedRefreshRuntime(input);
      // Mirrors the story selector's catch-and-continue behavior.
      await runtime.runTask(command(purposes.storyRelations)).catch(() => undefined);
      await expect(runtime.runTask(command())).rejects.toThrow(/budget|ambiguous/);
      expect(runTask).toHaveBeenCalledTimes(1);
      expect(events).not.toContainEqual(expect.objectContaining({ status: "completed" }));
    });

  it("an authority read failure permanently revokes all purposes even if the dependency recovers", async () => {
    let unavailable = true;
    const runTask = jest.fn(async (request: AgentRuntimeTaskCommand) => completed(request));
    const input = { manifest: m, delegate: { runTask, checkHealth: jest.fn() }, assertLocal: () => undefined,
      assertCurrent: async () => { if (unavailable) throw new Error("dependency unavailable"); }, record: jest.fn() };
    const runtime = guardedRefreshRuntime(input);
    await runtime.runTask(command(purposes.storyRelations)).catch(() => undefined);
    unavailable = false;
    await expect(runtime.runTask(command())).rejects.toThrow(/budget|ambiguous/);
    expect(runTask).not.toHaveBeenCalled();
  });

  it.each([purposes.generate, purposes.storyRelations, purposes.topicLabel, purposes.topicRelations, purposes.relatedTopicRelations])(
    "rechecks cutoff and fences after the last authority await for %s", async (purpose) => {
      for (const drift of ["cutoff", "fence"] as const) {
        let now = refreshNow, fence = true;
        const guard = new NewInputRefreshGuard(m, "new", { now: () => now,
          assertFences: () => { if (!fence) throw new Error("fence expired"); },
          assertCurrent: async () => {
            if (drift === "cutoff") now = new Date(Date.parse(m.observedThrough) + 1_800_001);
            else fence = false;
          } });
        const runTask = jest.fn(async (request: AgentRuntimeTaskCommand) => completed(request));
        const input = { manifest: m, delegate: { runTask, checkHealth: jest.fn() }, assertLocal: () => guard.assertLocal(),
          assertCurrent: () => guard.assertCurrent(), record: jest.fn() };
        await expect(guardedRefreshRuntime(input).runTask(command(purpose))).rejects.toThrow();
        expect(runTask).not.toHaveBeenCalled();
      }
    });

  it("checks the local fence after synchronous journaling immediately before invocation", async () => {
    let fence = true;
    const runTask = jest.fn(async (request: AgentRuntimeTaskCommand) => completed(request));
    const input = { manifest: m, delegate: { runTask, checkHealth: jest.fn() }, assertCurrent: async () => undefined,
      assertLocal: () => { if (!fence) throw new Error("fence expired"); }, record: () => { fence = false; } };
    await expect(guardedRefreshRuntime(input).runTask(command())).rejects.toThrow();
    expect(runTask).not.toHaveBeenCalled();
  });

  it("permits valid attested story, primary and auxiliary tasks with the unchanged model", async () => {
    const events: unknown[] = [];
    const runTask = jest.fn(async (request: AgentRuntimeTaskCommand) => completed(request));
    const runtime = guardedRefreshRuntime({ manifest: m, delegate: { runTask, checkHealth: jest.fn() },
      assertLocal: () => undefined, assertCurrent: async () => undefined, record: (event) => events.push(event) });
    for (const purpose of [purposes.storyRelations, purposes.generate, purposes.topicLabel, purposes.topicRelations, purposes.relatedTopicRelations]) {
      await expect(runtime.runTask(command(purpose))).resolves.toMatchObject({ status: "completed" });
    }
    expect(runTask).toHaveBeenCalledTimes(5);
    expect(events.filter((event) => (event as { status: string }).status === "completed")).toHaveLength(5);
  });

  it.each(["protection", "validation"])("rechecks freshness after awaited publication %s", async (phase) => {
    let now = refreshNow;
    const local = new NewInputRefreshGuard(m, "new", { now: () => now,
      assertFences: () => undefined, assertCurrent: async () => undefined });
    const expire = () => { now = new Date(Date.parse(m.observedThrough) + 1_800_001); };
    const candidate = { finalJob: { toSnapshot: () => ({ id: "new" }) },
      artifact: { toSnapshot: () => ({ sourceWindow: { ingestionCutoff: new Date(m.observedThrough) } }) } } as unknown as ReaderSummaryPublicationCommand;
    const guard = refreshPublicationGuard({ manifest: m, jobId: "new", assertLocal: () => local.assertLocal(),
      assertProtected: async () => { if (phase === "protection") expire(); },
      assertCurrent: async () => { if (phase === "validation") expire(); } });
    await expect(guard({} as PrismaReaderSummaryClient, candidate)).rejects.toThrow(/stale/);
  });

  it("rejects a publisher snapshot without protection predating its first SELECT", async () => {
    const tx = { $executeRaw: jest.fn(async () => 0) } as unknown as PrismaReaderSummaryClient;
    // Serializable validation still sees old policy after a writer committed.
    const current = jest.fn(async () => undefined);
    const input = { manifest: m, jobId: "new", assertLocal: () => undefined, assertCurrent: current,
      assertProtected: async () => { throw new Error("snapshot protection missing"); } };
    const candidate = { finalJob: { toSnapshot: () => ({ id: "new" }) },
      artifact: { toSnapshot: () => ({ sourceWindow: { ingestionCutoff: new Date(m.observedThrough) } }) } } as unknown as ReaderSummaryPublicationCommand;
    await expect(refreshPublicationGuard(input)(tx, candidate)).rejects.toThrow(/protection/);
    expect(current).not.toHaveBeenCalled();
  });

  it("never waits holding partial SHARE locks against any writer order", async () => {
    const execute = jest.fn(async () => 0);
    await lockRefreshAuthority({ $executeRaw: execute } as unknown as PrismaReaderSummaryClient);
    const sql = (execute.mock.calls as unknown as [TemplateStringsArray][])[0]![0].join("");
    expect(sql).toMatch(/in share mode nowait/iu);
    expect(sql.indexOf("source_item_engagement_snapshots")).toBeLessThan(sql.indexOf("source_items,"));
    expect(sql.indexOf("source_items,")).toBeLessThan(sql.indexOf("feed_items,"));
  });
});
