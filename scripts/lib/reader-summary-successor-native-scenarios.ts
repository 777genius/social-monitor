import assert from "node:assert/strict";
import type { Client } from "pg";
import type { Clock } from "@social-monitor/shared-kernel";
import type { ReaderSummaryJob } from "@social-monitor/summary/domain";
import { consumeRefreshSuccessor } from "./reader-summary-new-input-refresh-successor";
import type { RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
import { assertObserverConflict, assertUnlocked, instrument, lockConflict, poolTimeout, relations, sqlState, type Connection } from "./reader-summary-successor-native-support";

export async function nativeScenarios(input: { summary: Connection; observer: Client;
  manifest: RefreshManifest; clock: Clock; job(): ReaderSummaryJob; snapshot(): Promise<unknown> }) {
  const { summary, observer, manifest: m, clock, job, snapshot } = input;
  const consume = (connection = summary) => consumeRefreshSuccessor({ summary: connection,
    manifest: m, clock, job: job(), assertLocal: () => undefined });
  const before = await snapshot();
  const scope = [m.tenantId, m.workspaceId];
  const policy = "update reader_summary_policies set tone=$3 where tenant_id=$1::uuid and workspace_id=$2::uuid and scope_key='workspace'";
  const tones = await observer.query<{ tone: string }>("select tone from reader_summary_policies where tenant_id=$1::uuid and workspace_id=$2::uuid and scope_key='workspace'", scope);
  assert.equal(tones.rowCount, 1);
  const tone = tones.rows[0]!.tone;
  let committed = false;
  try {
    await assert.rejects(consume(instrument(summary, async (tx, ordinal, sql, phase) => {
      if (ordinal === 1 && sql === "BEGIN" && phase === "after") {
        await tx.$queryRaw`select 1 as holder_snapshot`;
        const changed = await observer.query(policy, [...scope, tone === "analytical" ? "neutral" : "analytical"]);
        assert.equal(changed.rowCount, 1); committed = true;
      }
    })), /Refresh successor input drifted/);
    assert(committed);
  } finally { const restored = await observer.query(policy, [...scope, tone]); assert.equal(restored.rowCount, 1); }
  assert.deepEqual(await snapshot(), before); await assertUnlocked(observer);

  for (const table of relations) {
    await assertObserverConflict(observer, table, consume);
    assert.deepEqual(await snapshot(), before); await assertUnlocked(observer);
  }

  let terminated = false, protectionRejected = false;
  const lost = instrument(summary, async (_tx, ordinal, sql, phase) => {
    if (ordinal === 2 && sql === "BEGIN" && phase === "after") {
      const holders = await observer.query<{ pid: number; vxid: string }>("select pid, virtualtransaction as vxid from pg_locks where database=(select oid from pg_database where datname=current_database()) and relation='public.reader_summary_jobs'::regclass and mode='ShareLock' and granted");
      assert.equal(holders.rowCount, 1);
      const stopped = await observer.query<{ stopped: boolean }>("select reader_summary_refresh_test_observer.terminate_holder($1, $2) as stopped", [holders.rows[0]!.pid, holders.rows[0]!.vxid]);
      assert.equal(stopped.rows[0]?.stopped, true); terminated = true;
    }
  });
  // Inspect the admission error separately: holder rollback may replace it.
  let ordinal = 0;
  const observeLoss: Connection = { $transaction: (work, options) => {
    const index = ++ordinal;
    return lost.$transaction(async (tx) => {
      try { return await work(tx); }
      catch (error) {
        if (index === 2 && error instanceof Error && /Refresh snapshot protection was lost/.test(error.message)) protectionRejected = true;
        throw error;
      }
    }, options);
  } };
  await assert.rejects(consume(observeLoss), (error: unknown) =>
    protectionRejected && (error instanceof Error && /snapshot protection was lost|Transaction|connection|terminated|closed/i.test(error.message)
      || ["57P01", "P2028", "P1017"].includes(sqlState(error) ?? "")));
  assert(terminated && protectionRejected);
  assert.deepEqual(await snapshot(), before); await assertUnlocked(observer);

  // Real PostgreSQL statement timeout after acquiring admission locks.
  let timedOut = false;
  await assert.rejects(consume(instrument(summary, async (tx, index, sql, phase) => {
    if (index === 2 && sql.includes("share row exclusive") && phase === "after") {
      await tx.$queryRaw`select set_config('statement_timeout', '100ms', true)`;
      try { await tx.$queryRaw`select pg_sleep(1)`; }
      catch (error) { timedOut = sqlState(error) === "57014"; throw error; }
    }
  })), (error: unknown) => timedOut && sqlState(error) === "57014");
  assert(timedOut); assert.deepEqual(await snapshot(), before); await assertUnlocked(observer);

  // Force both real holder transactions to own a connection before admissions
  // compete for the same max2 pool. No mocked lock/transaction results.
  let holders = 0, open!: () => void;
  const barrier = new Promise<void>((resolve) => { open = resolve; });
  const contender = () => instrument(summary, async (_tx, index, sql, phase) => {
    if (index === 1 && sql.includes("virtualxid as vxid") && phase === "after") {
      if (++holders === 2) open();
      await barrier;
    }
  });
  const results = await Promise.allSettled([consume(contender()), consume(contender())]);
  const successes = results.filter((result) => result.status === "fulfilled").length;
  assert.equal(holders, 2); assert(successes <= 1);
  for (const result of results) if (result.status === "rejected") {
    assert(lockConflict(result.reason) || poolTimeout(result.reason) ||
      (result.reason instanceof Error && /Refresh successor date budget consumed/.test(result.reason.message)),
    "unexpected concurrent failure; schema/fixture errors never count as conflict");
  }
  await assertUnlocked(observer);
  return { concurrentCommits: successes, consume, lockConflicts: relations.length };
}
