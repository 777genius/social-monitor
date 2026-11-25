import type { PoolClient } from "pg";
import { assertPostgres as assert } from "./reader-summary-publication-postgres-assertions";

export const publish = async (
  client: PoolClient,
  payload: Readonly<Record<string, unknown>>,
): Promise<string> => {
  const result = await client.query<{ readonly outcome: string }>(
    `SELECT outcome FROM publish_reader_summary($1::jsonb)`,
    [JSON.stringify(payload)],
  );
  const outcome = result.rows[0]?.outcome;
  assert(outcome !== undefined, "publication function returned no outcome");
  return outcome;
};

export const reverseObject = (
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(value).reverse());
