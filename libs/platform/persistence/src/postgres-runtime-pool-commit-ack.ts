import type { Pool, PoolClient } from 'pg';

/** A transport acknowledgement mismatch, not a server SQLSTATE. */
export class PostgresCommitAcknowledgementError extends Error {
  readonly code = 'POSTGRES_COMMIT_ACKNOWLEDGED_ROLLBACK';

  constructor() {
    super('PostgreSQL acknowledged the requested COMMIT as ROLLBACK');
    this.name = 'PostgresCommitAcknowledgementError';
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function acknowledgementError(
  result: unknown,
): PostgresCommitAcknowledgementError | undefined {
  // pg can return an array of QueryResults. Inspect tags, never row contents.
  const results = Array.isArray(result) ? result : [result];
  return results.some((entry) => record(entry)?.command === 'ROLLBACK')
    ? new PostgresCommitAcknowledgementError()
    : undefined;
}

function guardClient(client: PoolClient): void {
  const query = client.query;
  client.query = function (this: PoolClient, ...args: unknown[]): unknown {
    const config = record(args[0]);
    const text = typeof args[0] === 'string' ? args[0] : config?.text;
    // Only a standalone COMMIT is owned here. Batches, comments, quoted SQL,
    // and pg Submittable/streaming queries retain their original behavior.
    if (
      typeof config?.submit === 'function' ||
      typeof text !== 'string' ||
      !/^\s*COMMIT(?:\s+(?:WORK|TRANSACTION))?\s*;?\s*$/i.test(text)
    ) {
      return Reflect.apply(query, this, args);
    }

    // Match pg's callback precedence: third argument, second, then config.
    const callbackIndex = args[2] ? 2 : typeof args[1] === 'function' ? 1 : 0;
    const callback = callbackIndex === 0 ? config?.callback : args[callbackIndex];
    if (typeof callback === 'function') {
      const guardedCallback = function (
        this: unknown, ...callbackArgs: unknown[]
      ): unknown {
        if (callbackArgs[0] === null || callbackArgs[0] === undefined) {
          const error = acknowledgementError(callbackArgs[1]);
          if (error !== undefined) {
            callbackArgs[0] = error;
          }
        }
        return Reflect.apply(callback, this, callbackArgs);
      };
      if (callbackIndex === 0) {
        args[0] = { ...config, callback: guardedCallback };
      } else {
        args[callbackIndex] = guardedCallback;
      }
      return Reflect.apply(query, this, args);
    }

    // Invalid overloads still fail in pg itself; original rejections propagate.
    const pending = Reflect.apply(query, this, args) as Promise<unknown>;
    return pending.then((result) => {
      const error = acknowledgementError(result);
      if (error !== undefined) {
        throw error;
      }
      return result;
    });
  } as PoolClient['query'];
}

/** Keep the real Pool and lease identity; install once per physical client. */
export function guardPostgresPoolCommitAcknowledgements(pool: Pool): Pool {
  pool.on('connect', guardClient);
  return pool;
}
