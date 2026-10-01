import { fork } from "node:child_process";
import { resolve } from "node:path";
import { Pool } from "pg";
import { reserveFirstPublicationDay } from "./reader-summary-first-publication-reservation";
import { nativeFirstpubPrismaClient, pg18FixtureScope, type NativeFirstpubClaimFixture } from "./reader-summary-first-publication-pg18.spec-support";

const day = { ...pg18FixtureScope, startedAt: "2026-09-29T00:00:00.000Z", endedAt: "2026-09-30T00:00:00.000Z" };
const crashDatabase = "firstpub_synthetic_claim_slots_unknown";

/** Kill only our own fork after it reports the real reservation COMMIT.
 * It invokes the actual reservation adapter and tenant middleware; no provider
 * is called. Parent then uses an independent connection to prove no reclaim. */
export async function proveNativeFirstpubProcessCrash(f: NativeFirstpubClaimFixture): Promise<void> {
  if (f.database !== crashDatabase) throw new Error("Crash fixture requires its bounded own database");
  const child = fork(__filename, [], {
    cwd: process.cwd(),
    execArgv: ["-r", resolve("node_modules/ts-node/register/transpile-only"), "-r", resolve("node_modules/tsconfig-paths/register")],
    // No inherited database URLs, passwords, provider settings or secrets.
    env: { NODE_ENV: "test", TS_NODE_TRANSPILE_ONLY: "true" },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit) => {
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
  try {
    await new Promise<void>((resolveCommit, rejectCommit) => {
      const timeout = setTimeout(() => rejectCommit(new Error("Own crash child did not prove COMMIT before deadline")), 10_000);
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        if (error === undefined) resolveCommit(); else rejectCommit(error);
      };
      child.once("error", finish);
      child.once("exit", () => finish(new Error("Own crash child exited before COMMIT")));
      child.once("message", (message: unknown) => {
        if (message === "FIRSTPUB_COMMITTED") finish();
        else finish(new Error("Own crash child failed reservation"));
      });
      child.send({ socketHost: f.socketHost, database: crashDatabase });
    });
    expect(child.kill("SIGKILL")).toBe(true);
    expect((await exited).signal).toBe("SIGKILL");
    const rows = await f.admin.query("SELECT count(*) FROM public.reader_summary_publication_slots WHERE current_publication_id IS NULL");
    expect(Number(rows.rows[0].count)).toBe(1);
    await expect(reserveFirstPublicationDay(f.client, day, new Date())).rejects.toMatchObject({ code: "P0001" });
  } finally {
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  }
}

if (require.main === module && process.send !== undefined) {
  process.once("message", (message: unknown) => {
    void (async () => {
      const input = message as { socketHost?: unknown; database?: unknown };
      if (typeof input.socketHost !== "string" ||
          !/^\/proc\/\d+\/cwd\/\.firstpub-native-pg18-[A-Za-z0-9]+\/socket$/u.test(input.socketHost) ||
          input.database !== crashDatabase) throw new Error("Only the owned synthetic crash socket/database is allowed");
      const pool = new Pool({ host: input.socketHost, port: 5432, database: crashDatabase,
        user: "firstpub_synthetic_finite", connectionTimeoutMillis: 5000, max: 1 });
      await reserveFirstPublicationDay(nativeFirstpubPrismaClient(pool), day, new Date());
      // Keep this process/connection alive until the parent kills it. The
      // message follows actual successful COMMIT, not transaction intent.
      process.send?.("FIRSTPUB_COMMITTED");
    })().catch(() => { process.send?.("FIRSTPUB_FAILED"); });
  });
}
