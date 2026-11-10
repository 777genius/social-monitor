/** Disposable Nest context only. No application imports, DB, queues or model calls. */
async function runSyntheticWorkerSignalFixture(): Promise<void> {
  const { Module } = require("@nestjs/common") as typeof import("@nestjs/common");
  const { NestFactory } = require("@nestjs/core") as typeof import("@nestjs/core");
  const event = (name: string): void => { process.stdout.write(`${name}\n`); };
  class SyntheticLoop {
    async onModuleDestroy(): Promise<void> {
      event("destroy-start");
      await new Promise<void>((resolve) => setTimeout(resolve, 600));
      event("destroy-done");
    }
    beforeApplicationShutdown(): void { event("modules-drained"); }
  }
  class SyntheticWorker {}
  Module({ providers: [SyntheticLoop] })(SyntheticWorker);
  const app = await NestFactory.createApplicationContext(SyntheticWorker, { logger: false });
  if (process.argv[2] === "after-listener-removal") {
    const originalKill = process.kill.bind(process);
    process.kill = ((pid: number, signal?: string | number): boolean => {
      if (pid === process.pid && signal === "SIGTERM") {
        event(`listeners-removed:${process.listenerCount("SIGTERM")}`);
        setTimeout(() => originalKill(pid, signal), 2_000);
        return true;
      }
      return originalKill(pid, signal);
    }) as typeof process.kill;
  }
  app.enableShutdownHooks(["SIGTERM"]);
  setInterval(() => undefined, 1_000);
  event("ready");

}
void runSyntheticWorkerSignalFixture();
