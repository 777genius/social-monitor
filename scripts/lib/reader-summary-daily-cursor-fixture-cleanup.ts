import type { Pool } from "pg";

// pg-pool removes clients from totalCount before their asynchronous end callback.
// Pool.end() can therefore resolve while PostgreSQL still has those backends.
export async function endDailyCursorFixturePool(pool: Pool): Promise<void> {
  let remaining = pool.totalCount;
  let onRemove = (): void => undefined;
  const disconnected = new Promise<void>((resolve) => {
    onRemove = () => {
      remaining -= 1;
      if (remaining === 0) resolve();
    };
    if (remaining === 0) resolve();
    else pool.on("remove", onRemove);
  });
  try {
    await pool.end();
    await disconnected;
  } finally {
    pool.removeListener("remove", onRemove);
  }
}

export async function runDailyCursorFixtureWithCleanup(
  body: () => Promise<void>,
  cleanup: () => Promise<void>,
): Promise<void> {
  const errors: unknown[] = [];
  try { await body(); } catch (error) { errors.push(error); }
  try { await cleanup(); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Daily cursor fixture body and cleanup failed");
  }
}
