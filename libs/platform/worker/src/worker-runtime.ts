import { Injectable, type BeforeApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { DomainError, redactSensitiveText } from '@social-monitor/shared-kernel';

export type WorkerRuntimeOptions = {
  readonly serviceName: string;
  readonly shutdownDrainTimeoutMs?: number;
};

export type WorkerRuntimeFailureDiagnostics = {
  readonly classification: string;
  readonly code: string | undefined;
  readonly message: string;
};

/**
 * Keeps worker failures actionable without serializing provider payloads or
 * connection URLs. Prisma adapter errors may put SQLSTATE/kind on a bounded
 * cause chain while exposing only "unknown" at the root.
 */
export const classifyWorkerRuntimeFailure = (
  error: unknown,
): WorkerRuntimeFailureDiagnostics => {
  const facts = workerFailureFacts(error);
  const searchable = [facts.code, facts.kind, facts.message]
    .filter((value): value is string => value !== undefined)
    .join(' ')
    .toLocaleLowerCase('en-US');
  const classification =
    /(^|\D)53300(\D|$)|too[ _-]*many[ _-]*connections/.test(searchable)
      ? 'postgres.too_many_connections'
      : /p2024|pool[ _-]*(?:timeout|exhaust)/.test(searchable)
        ? 'postgres.pool_timeout'
        : /p1001|econnrefused|connection[ _-]*(?:closed|terminated|unavailable)/.test(
              searchable,
            )
          ? 'postgres.unavailable'
          : error instanceof DomainError
            ? `domain.${safeFailureToken(error.code) ?? 'error'}`
            : `runtime.${safeFailureToken(facts.kind) ?? 'error'}`;
  const message = meaningfulFailureMessage(facts.message)
    ? redactSensitiveText(facts.message as string).slice(0, 240)
    : `classified:${classification}`;

  return {
    classification,
    code: safeFailureToken(facts.code),
    message,
  };
};

type WorkerFailureFacts = {
  readonly code: string | undefined;
  readonly kind: string | undefined;
  readonly message: string | undefined;
};

const workerFailureFacts = (error: unknown): WorkerFailureFacts => {
  let candidate = error;
  let code: string | undefined;
  let kind: string | undefined;
  let message: string | undefined;
  const seen = new Set<object>();

  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof candidate !== 'object' || candidate === null || seen.has(candidate)) {
      break;
    }
    seen.add(candidate);
    const record = candidate as Readonly<Record<string, unknown>>;
    code ??= firstFailureString(record, ['code', 'sqlState', 'sqlstate', 'originalCode']);
    kind ??= firstFailureString(record, ['kind', 'name', 'errorType']);
    const candidateMessage = firstFailureString(record, [
      'message',
      'originalMessage',
    ]);
    if (message === undefined || !meaningfulFailureMessage(message)) {
      message = candidateMessage;
    }
    candidate = record.cause;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    message = error;
  }
  return { code, kind, message };
};

const firstFailureString = (
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const meaningfulFailureMessage = (value: string | undefined): boolean =>
  value !== undefined &&
  value.trim().length > 0 &&
  !/^(?:unknown|error|undefined|null)$/i.test(value.trim());

const safeFailureToken = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized !== undefined && /^[A-Za-z0-9_.-]{1,64}$/.test(normalized)
    ? normalized
    : undefined;
};

@Injectable()
export class WorkerRuntime implements OnModuleInit, BeforeApplicationShutdown {
  private readonly logger: StructuredLogger;
  private readonly drainTimeoutMs: number;
  private started = false;
  private acceptingWork = false;
  private activeOperations = 0;
  private readonly drainWaiters = new Set<() => void>();

  constructor(private readonly options: WorkerRuntimeOptions) {
    this.logger = new NestStructuredLogger(WorkerRuntime.name);
    this.drainTimeoutMs = options.shutdownDrainTimeoutMs ?? 30_000;
  }

  onModuleInit(): void {
    this.started = true;
    this.acceptingWork = true;
    this.logger.info('worker started', { service: this.options.serviceName });
  }

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    if (!this.started) {
      return;
    }
    this.acceptingWork = false;
    await this.waitForDrain();
    this.started = false;
    this.logger.info('worker stopped', {
      service: this.options.serviceName,
      signal,
      activeOperations: this.activeOperations,
    });
  }

  onApplicationShutdown(signal?: string): Promise<void> {
    return this.beforeApplicationShutdown(signal);
  }

  isStarted(): boolean {
    return this.started;
  }

  isAcceptingWork(): boolean {
    return this.started && this.acceptingWork;
  }

  getActiveOperations(): number {
    return this.activeOperations;
  }

  async runIfAccepting<TValue>(operation: string, work: () => Promise<TValue>): Promise<TValue> {
    if (!this.isAcceptingWork()) {
      throw new DomainError('operation.backpressure', 'Worker is draining and not accepting new work', {
        service: this.options.serviceName,
        operation,
      });
    }

    this.activeOperations += 1;

    try {
      return await work();
    } finally {
      this.activeOperations -= 1;
      this.notifyDrainWaiters();
    }
  }

  private async waitForDrain(): Promise<void> {
    if (this.activeOperations === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      const waiter = () => {
        clearTimeout(timeout);
        this.drainWaiters.delete(waiter);
        resolve();
      };
      const timeout = setTimeout(() => {
        this.logger.warn('worker drain threshold exceeded; continuing to wait before resource shutdown', {
          service: this.options.serviceName,
          activeOperations: this.activeOperations,
          drainTimeoutMs: this.drainTimeoutMs,
        });
      }, this.drainTimeoutMs);

      this.drainWaiters.add(waiter);
    });
  }

  private notifyDrainWaiters(): void {
    if (this.activeOperations !== 0) {
      return;
    }

    for (const waiter of [...this.drainWaiters]) {
      waiter();
    }
  }
}
