import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { Pool, type PoolConfig } from "pg";
import {
  endDailyCursorFixturePool,
  runDailyCursorFixtureWithCleanup,
} from "./reader-summary-daily-cursor-fixture-cleanup";

// Use the installed pg-pool lifecycle; only the wire client is controlled.
// Disconnect acknowledgement is explicitly delayed, with no clock or network.
class WireClient extends EventEmitter {
  _queryable = true;
  _ending = false;
  disconnect: (() => void) | undefined;
  connect(callback: () => void): void { callback(); }
  end(callback: () => void): void {
    this._ending = true;
    this.disconnect = callback;
  }
}

async function idleFixture(): Promise<{ pool: Pool; wire: WireClient }> {
  const pool = new Pool({ Client: WireClient, max: 1 } as unknown as PoolConfig);
  const client = await pool.connect();
  client.release();
  expect(pool.idleCount).toBe(1);
  return { pool, wire: client as unknown as WireClient };
}

const fatal = () => Object.assign(
  new Error("terminating connection due to administrator command"),
  { code: "57P01", severity: "FATAL" },
);

describe("daily cursor fixture cleanup", () => {
  it("reproduces legacy Pool.end resolving before a stale idle backend disconnects", async () => {
    const { pool, wire } = await idleFixture();
    await pool.end();
    expect(pool.totalCount).toBe(0);
    expect(wire.disconnect).toBeDefined();
    const error = fatal();
    // pg_terminate_backend arriving now emits through pg-pool's idle listener.
    expect(() => wire.emit("error", error)).toThrow(error.message);
    wire.disconnect!();
  });

  it("waits for actual removal before database termination/drop and success", async () => {
    const fixtures = await Promise.all([idleFixture(), idleFixture(), idleFixture()]);
    const trace: string[] = [];
    const run = runDailyCursorFixtureWithCleanup(async () => {
      await Promise.all(fixtures.map(({ pool }) => endDailyCursorFixturePool(pool)));
    }, async () => { trace.push("terminate", "drop"); })
      .then(() => { trace.push("OK"); });
    await Promise.resolve();
    expect(trace).toEqual([]);
    fixtures[0].wire.disconnect!();
    fixtures[1].wire.disconnect!();
    await Promise.resolve();
    expect(trace).toEqual([]);
    fixtures[2].wire.disconnect!();
    await run;
    expect(trace).toEqual(["terminate", "drop", "OK"]);
    for (const { pool } of fixtures) expect(pool.listenerCount("remove")).toBe(0);
  });

  it("ends an unused pool (partial setup failure)", async () => {
    await expect(endDailyCursorFixturePool(new Pool())).resolves.toBeUndefined();
  });

  it("does not swallow unexpected idle connection errors", async () => {
    const { pool, wire } = await idleFixture();
    const error = Object.assign(new Error("unexpected connection error"), { code: "08006" });
    expect(() => wire.emit("error", error)).toThrow(error.message);
    wire.disconnect!();
    await pool.end();
  });

  it.each(["body", "cleanup", "both"])("propagates %s failure and always cleans up", async (stage) => {
    const bodyError = new Error("body assertion failed");
    const cleanupError = new Error("DROP DATABASE failed");
    const cleanup = jest.fn(async () => {
      if (stage !== "body") throw cleanupError;
    });
    const result = runDailyCursorFixtureWithCleanup(async () => {
      if (stage !== "cleanup") throw bodyError;
    }, cleanup);
    if (stage === "both") {
      await expect(result).rejects.toMatchObject({ errors: [bodyError, cleanupError] });
    } else {
      await expect(result).rejects.toBe(stage === "body" ? bodyError : cleanupError);
    }
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("wires the real gate to disconnect before strict cleanup and report OK last", () => {
    const source = readFileSync("scripts/check-reader-summary-daily-execution-cursor-postgres.ts", "utf8");
    expect(source).toContain("[firstPool, secondPool, adminPool].map(endDailyCursorFixturePool)");
    expect(source).toContain("void runDailyCursorFixtureWithCleanup(main, () =>");
    expect(source).toContain("runDailyCursorFixtureWithCleanup(cleanup, () => server.end()))");
    expect(source).toContain('.then(() => console.log("Reader summary daily execution cursor PostgreSQL 18 gate OK"))');
    expect(source).toContain("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()");
    expect(source).toContain("DROP DATABASE ${quoteIdentifier(databaseName)}");
  });
});
