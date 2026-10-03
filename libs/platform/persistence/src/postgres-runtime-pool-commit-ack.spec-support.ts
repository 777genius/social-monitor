import { EventEmitter } from 'node:events';

import { Client, Pool, type ClientConfig, type PoolConfig } from 'pg';

/** Local synthetic protocol events only: no socket, database, or SQL execution. */
export class CommitAckWire extends EventEmitter {
  _connecting = false;
  readonly parsedStatements = {};
  readonly queries: string[] = [];
  readonly stream = { destroy: () => this.end() };

  connect(): void {
    this._connecting = true;
    queueMicrotask(() => this.emit('readyForQuery', { status: 'I' }));
  }

  query(text: string): void {
    this.queries.push(text);
  }

  complete(...tags: string[]): void {
    for (const text of tags) {
      this.emit('commandComplete', { text });
    }
    this.emit('readyForQuery', { status: 'I' });
  }

  fail(error: Error): void {
    this.emit('errorMessage', error);
    this.emit('readyForQuery', { status: 'E' });
  }

  end(): void {
    queueMicrotask(() => this.emit('end'));
  }

  ref(): void {}
  unref(): void {}
}

export class CommitAckClient extends Client {
  readonly wire: CommitAckWire;

  constructor(config: ClientConfig = {}) {
    const wire = new CommitAckWire();
    super({
      ...config,
      connectionString: undefined,
      host: 'synthetic.invalid',
      port: 5432,
      user: 'synthetic',
      database: 'synthetic',
      password: 'synthetic',
      ssl: false,
      connection: wire,
    } as ClientConfig);
    this.wire = wire;
  }
}

export function commitAckPool(max: 1 | 2 = 1): Pool {
  if (max !== 1 && max !== 2) {
    throw new RangeError('Synthetic COMMIT acknowledgement pool max must be 1 or 2');
  }
  return new Pool({
    min: 0,
    max,
    idleTimeoutMillis: 0,
    Client: CommitAckClient,
  } as PoolConfig);
}
