import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("worker SIGTERM replay contract", () => {
  it("pins the exact Nest guard used by the host capability probe", () => {
    const source = readFileSync(require.resolve("@nestjs/core/nest-application-context.js"));
    expect(createHash("sha256").update(source).digest("hex"))
      .toBe("2e4f6131799125e3098bbdab8701b7380123ea2841799ebe932f190c21cb9d11");
  });

  it.each(["during-drain", "after-listener-removal"])("handles replay %s without interrupting hooks", async (mode) => {
    const child = spawn(process.execPath, ["--experimental-strip-types",
      join(__dirname, "worker-shutdown-signal.fixture.cts"), mode], { stdio: ["ignore", "pipe", "pipe"] });
    const lines: string[] = [];
    let pending = "";
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.stdout.on("data", (chunk) => {
      pending += String(chunk);
      const parts = pending.split("\n"); pending = parts.pop()!;
      for (const line of parts) {
        lines.push(line);
        if (line === "ready" || (mode === "during-drain" && line === "destroy-start") ||
            (mode === "after-listener-removal" && line === "listeners-removed:0")) child.kill("SIGTERM");
      }
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Synthetic Nest timeout: ${stderr}`)), 10_000);
        child.once("error", reject);
        child.once("exit", (code, signal) => resolve({ code, signal }));
      });
      expect(result).toEqual({ code: null, signal: "SIGTERM" });
      expect(lines.filter((line) => line === "destroy-start")).toHaveLength(1);
      expect(lines.indexOf("destroy-done")).toBeGreaterThan(lines.indexOf("destroy-start"));
      expect(lines.indexOf("modules-drained")).toBeGreaterThan(lines.indexOf("destroy-done"));
      if (mode === "after-listener-removal") expect(lines).toContain("listeners-removed:0");
    } finally {
      if (timer) clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 15_000);
});
