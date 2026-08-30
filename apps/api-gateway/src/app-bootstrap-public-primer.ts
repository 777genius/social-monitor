import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

export const APP_BOOTSTRAP_PUBLIC_PRIME_ENABLED = Symbol(
  'APP_BOOTSTRAP_PUBLIC_PRIME_ENABLED',
);
export const APP_BOOTSTRAP_PUBLIC_PRIME_CLIENT = Symbol(
  'APP_BOOTSTRAP_PUBLIC_PRIME_CLIENT',
);
export const APP_BOOTSTRAP_PUBLIC_PRIME_SCHEDULER = Symbol(
  'APP_BOOTSTRAP_PUBLIC_PRIME_SCHEDULER',
);

export const APP_BOOTSTRAP_PUBLIC_PRIME_INITIAL_DELAY_MS = 2_000;
export const APP_BOOTSTRAP_PUBLIC_PRIME_RETRY_DELAY_MS = 2_000;
export const APP_BOOTSTRAP_PUBLIC_PRIME_MAX_ATTEMPTS = 3;

const APP_BOOTSTRAP_PUBLIC_URL =
  'https://social-monitor.app/app/bootstrap';

export interface AppBootstrapPublicPrimeClient {
  request(): Promise<void>;
}

export interface AppBootstrapPublicPrimeScheduler {
  schedule(delayMs: number, callback: () => void): unknown;
  cancel(handle: unknown): void;
}

export const nodeAppBootstrapPublicPrimeClient: AppBootstrapPublicPrimeClient = {
  async request() {
    const response = await fetch(APP_BOOTSTRAP_PUBLIC_URL, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Public app bootstrap prime returned ${response.status}`);
    }
    await response.arrayBuffer();
  },
};

export const nodeAppBootstrapPublicPrimeScheduler: AppBootstrapPublicPrimeScheduler = {
  schedule(delayMs, callback) {
    const handle = setTimeout(callback, delayMs);
    handle.unref();
    return handle;
  },
  cancel(handle) {
    clearTimeout(handle as NodeJS.Timeout);
  },
};

@Injectable()
export class AppBootstrapPublicPrimer
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private attempt = 0;
  private stopped = false;
  private timer: unknown;

  constructor(
    @Inject(APP_BOOTSTRAP_PUBLIC_PRIME_ENABLED)
    private readonly enabled: boolean,
    @Inject(APP_BOOTSTRAP_PUBLIC_PRIME_CLIENT)
    private readonly client: AppBootstrapPublicPrimeClient,
    @Inject(APP_BOOTSTRAP_PUBLIC_PRIME_SCHEDULER)
    private readonly scheduler: AppBootstrapPublicPrimeScheduler,
  ) {}

  onApplicationBootstrap(): void {
    if (this.enabled) {
      this.schedule(APP_BOOTSTRAP_PUBLIC_PRIME_INITIAL_DELAY_MS);
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer !== undefined) {
      this.scheduler.cancel(this.timer);
      this.timer = undefined;
    }
  }

  private schedule(delayMs: number): void {
    this.timer = this.scheduler.schedule(delayMs, () => {
      this.timer = undefined;
      void this.prime();
    });
  }

  private async prime(): Promise<void> {
    this.attempt += 1;
    try {
      await this.client.request();
    } catch {
      if (
        !this.stopped &&
        this.attempt < APP_BOOTSTRAP_PUBLIC_PRIME_MAX_ATTEMPTS
      ) {
        this.schedule(APP_BOOTSTRAP_PUBLIC_PRIME_RETRY_DELAY_MS);
      }
    }
  }
}
