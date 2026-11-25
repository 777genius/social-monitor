import { writeSync } from "node:fs";

const originalDeadlineMs = 120_000;
const totalDeadlineMs = 900_000;

type BudgetRuntime = {
  transition?(): Promise<void>;
  settled?(): Promise<void>;
  elapsedMs(): number;
  schedule(work: () => void, delayMs: number): () => void;
  fail(message: string): never;
};

const processRuntime: BudgetRuntime = {
  transition: () => notifyParent("renewal"),
  settled: () => notifyParent("completed"),
  // Includes ts-node compilation and imports; never reset at a phase boundary.
  elapsedMs: () => process.uptime() * 1000,
  schedule: (work, delayMs) => {
    const timer = setTimeout(work, delayMs);
    return () => clearTimeout(timer);
  },
  fail: (message) => {
    try { writeSync(2, `${message}\n`); } finally { process.exit(124); }
  },
};

// The dedicated parent acknowledges the transition before renewal can start.
async function notifyParent(phase: "renewal" | "completed"): Promise<void> {
  if (!process.send || !process.connected) throw new Error("Native fixture requires its dedicated watchdog parent");
  await new Promise<void>((resolve, reject) => {
    const disconnect = () => finish(new Error("Native watchdog disconnected"));
    const message = (value: unknown) => {
      if (value === `native-metric:${phase}:accepted`) finish();
      else finish(new Error("Invalid native watchdog acknowledgement"));
    };
    const finish = (error?: Error) => {
      process.off("message", message);
      process.off("disconnect", disconnect);
      if (error) reject(error); else resolve();
    };
    process.once("message", message);
    process.once("disconnect", disconnect);
    process.send!(`native-metric:${phase}`, (error) => { if (error) finish(error); });
  });
}

/** Test-harness deadlines; the dedicated parent also bounds blocked JS/startup. */
export class RetainedMetricNativeBudget {
  private phase: "original" | "renewal" | "completed" | "disposed" = "original";
  private transitionStarted = false;
  private readonly cancelOriginal: () => void;
  private readonly cancelTotal: () => void;

  constructor(private readonly runtime: BudgetRuntime = processRuntime) {
    this.checkDeadline(); // Fail before the caller can load Prisma or seed fixtures.
    this.cancelTotal = runtime.schedule(() => {
      if (this.phase !== "disposed") runtime.fail("Native metric fixture exceeded absolute 900000ms process budget");
    }, totalDeadlineMs - runtime.elapsedMs());
    this.cancelOriginal = runtime.schedule(() => {
      if (this.phase === "original") runtime.fail("Original metric fixture exceeded absolute 120000ms process budget");
    }, originalDeadlineMs - runtime.elapsedMs());
  }

  async runRenewal<T>(work: () => Promise<T>): Promise<T> {
    if (this.phase !== "original" || this.transitionStarted) throw new Error("Native renewal must run exactly once after the original fixture");
    this.checkDeadline();
    this.transitionStarted = true;
    if (this.runtime.transition) await this.runtime.transition();
    if (this.phase !== "original") throw new Error("Native renewal budget was disposed before transition");
    this.checkDeadline();
    this.phase = "renewal";
    this.cancelOriginal();
    const result = await work();
    if (this.phase !== "renewal") throw new Error("Native renewal budget was disposed before completion");
    this.checkDeadline();
    this.phase = "completed";
    return result;
  }

  complete(): void {
    this.checkDeadline();
    if (this.phase !== "completed") throw new Error("Native fixture cannot pass without completed renewal coverage");
  }

  dispose(): void {
    this.phase = "disposed";
    this.cancelOriginal();
    this.cancelTotal();
  }

  checkDeadline(): void {
    const elapsed = this.runtime.elapsedMs();
    if (elapsed >= totalDeadlineMs) this.runtime.fail("Native metric fixture exceeded absolute 900000ms process budget");
    if (this.phase === "original" && elapsed >= originalDeadlineMs) {
      this.runtime.fail("Original metric fixture exceeded absolute 120000ms process budget");
    }
  }
}

export async function runWithNativeMetricBudget(
  work: (budget: RetainedMetricNativeBudget) => Promise<void>,
  runtime: BudgetRuntime = processRuntime,
): Promise<void> {
  const budget = new RetainedMetricNativeBudget(runtime);
  try {
    await work(budget);
    budget.complete();
    if (runtime.settled) await runtime.settled();
  } catch (error) {
    budget.checkDeadline(); // Exceptional work/cleanup settlement must beat timer disposal.
    throw error;
  } finally { budget.dispose(); }
}
