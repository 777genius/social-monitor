import { Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import { NestFactory, type NestApplicationContext } from "@nestjs/core";

import { WorkerShutdownMarker } from "./worker-shutdown-marker";

describe("WorkerShutdownMarker", () => {
  it("writes only after Nest awaits all module destruction and waits for stdout flush", async () => {
    let completeDestroy!: () => void;
    let destroyStarted!: () => void;
    const entered = new Promise<void>((resolve) => { destroyStarted = resolve; });
    const pending = new Promise<void>((resolve) => { completeDestroy = resolve; });
    @Injectable()
    class SyntheticLoop implements OnModuleDestroy {
      async onModuleDestroy(): Promise<void> { destroyStarted(); await pending; }
    }
    @Module({ providers: [SyntheticLoop, WorkerShutdownMarker] })
    class SyntheticWorker {}
    const app = await NestFactory.createApplicationContext(SyntheticWorker, { logger: false });
    const writes: string[] = [];
    let flush!: () => void;
    const write = jest.spyOn(process.stdout, "write").mockImplementation((chunk, ...args) => {
      writes.push(String(chunk));
      const callback = args.find((value) => typeof value === "function") as (() => void);
      flush = callback;
      return true;
    });
    try {
      let closed = false;
      const close = (app as NestApplicationContext).close("SIGTERM").then(() => { closed = true; });
      await entered;
      expect(writes).toEqual([]);
      completeDestroy();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(writes).toHaveLength(1);
      expect(JSON.parse(writes[0]!)).toEqual({
        marker: "social-monitor-worker-modules-drained-v1", signal: "SIGTERM",
        pid: process.pid, completed_at_ms: expect.any(Number),
      });
      expect(closed).toBe(false);
      flush();
      await close;
      expect(closed).toBe(true);
    } finally { write.mockRestore(); }
  });

  it("does not publish a signal completion for ordinary close or other signals", async () => {
    const write = jest.spyOn(process.stdout, "write");
    try {
      const marker = new WorkerShutdownMarker();
      await marker.beforeApplicationShutdown();
      await marker.beforeApplicationShutdown("SIGINT");
      expect(write).not.toHaveBeenCalled();
    } finally { write.mockRestore(); }
  });
});
