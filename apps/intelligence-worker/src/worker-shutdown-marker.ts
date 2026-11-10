import { Injectable, type BeforeApplicationShutdown } from "@nestjs/common";

/** Nest invokes this phase only after every onModuleDestroy promise has settled. */
@Injectable()
export class WorkerShutdownMarker implements BeforeApplicationShutdown {
  async beforeApplicationShutdown(signal?: string): Promise<void> {
    if (signal !== "SIGTERM") return;
    // No payloads, account identifiers or model calls. Wait for the write before exit.
    const marker = JSON.stringify({
      marker: "social-monitor-worker-modules-drained-v1",
      signal,
      pid: process.pid,
      completed_at_ms: Date.now(),
    });
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(`${marker}\n`, (error) => error ? reject(error) : resolve());
    });
  }
}
