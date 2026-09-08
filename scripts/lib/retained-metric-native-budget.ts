import { writeSync } from "node:fs";

const originalDeadlineMs = 120_000;
const totalDeadlineMs = 900_000;

type BudgetRuntime = {
  elapsedMs(): number;
  schedule(work: () => void, delayMs: number): () => void;
  fail(message: string): never;
};

const processRuntime: BudgetRuntime = {
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

/** Test-harness deadlines only. The outer run-with-timeout also bounds blocked JS. */
export class RetainedMetricNativeBudget {
  private phase: "original" | "renewal" | "completed" | "disposed" = "original";
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
    if (this.phase !== "original") throw new Error("Native renewal must run exactly once after the original fixture");
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

  private checkDeadline(): void {
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
  } finally { budget.dispose(); }
}
