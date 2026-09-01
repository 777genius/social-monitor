import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

describe("reader-summary common date lock", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "reader-summary-date-lock-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("excludes a migration from a same-date daily subprocess", async () => {
    const daily = startLocked({
      date: "2026-08-01",
      name: "daily",
      holdSeconds: "0.25",
      global: false,
    });
    await waitFor(join(directory, "daily.started"));
    const migration = startLocked({
      date: "2026-08-01",
      name: "migration",
      holdSeconds: "0",
      global: true,
    });

    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    expect(existsSync(join(directory, "migration.started"))).toBe(false);
    await Promise.all([completed(daily), completed(migration)]);

    expect(readFileSync(join(directory, "daily.token"), "utf8").trim()).toBe(
      "reader-summary-date:2026-08-01:1",
    );
    expect(
      readFileSync(join(directory, "migration.token"), "utf8").trim(),
    ).toBe("reader-summary-date:2026-08-01:2");
  });

  it("uses the actual daily-run admission lock to isolate shared outputs", async () => {
    const daily = startLocked({
      date: "2026-08-01",
      name: "daily-global",
      holdSeconds: "0.25",
      global: true,
    });
    await waitFor(join(directory, "daily-global.started"));
    const migration = startLocked({
      date: "2026-08-02",
      name: "migration-global",
      holdSeconds: "0",
      global: true,
    });

    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    expect(existsSync(join(directory, "migration-global.started"))).toBe(false);
    await Promise.all([completed(daily), completed(migration)]);
  });

  it("fails closed unless migration lock witnesses resolve to the same inode", () => {
    const global = join(directory, "daily-run.lock");
    const dateLocks = join(directory, "date-locks");
    const fences = join(directory, "fences");
    mkdirSync(dateLocks);
    mkdirSync(fences);
    writeFileSync(global, "");
    const run = (canonicalGlobal: string) => spawnSync("bash", [
      lockScript(), "--date", "2026-08-01",
      "--date-lock-dir", dateLocks, "--fence-dir", fences,
      "--global-lock", global, "--require-preexisting-authority",
      "--canonical-global-lock", canonicalGlobal,
      "--canonical-date-lock-dir", dateLocks,
      "--canonical-fence-dir", fences,
      "--wait-seconds", "1", "--", "bash", "-c", "true",
    ]);
    expect(run(global).status).toBe(0);
    const typo = join(directory, "daily-run-typo.lock");
    writeFileSync(typo, "");
    const mismatch = run(typo);
    expect(mismatch.status).toBe(76);
    expect(String(mismatch.stderr)).toContain("identity mismatch");

    const otherDateLocks = join(directory, "other-date-locks");
    mkdirSync(otherDateLocks);
    const directoryMismatch = spawnSync("bash", [
      lockScript(), "--date", "2026-08-01",
      "--date-lock-dir", dateLocks, "--fence-dir", fences,
      "--global-lock", global, "--require-preexisting-authority",
      "--canonical-global-lock", global,
      "--canonical-date-lock-dir", otherDateLocks,
      "--canonical-fence-dir", fences,
      "--wait-seconds", "1", "--", "bash", "-c", "true",
    ]);
    expect(directoryMismatch.status).toBe(76);
    expect(String(directoryMismatch.stderr)).toContain("identity mismatch");
  });

  it("rejects symlinked canonical lock authority without following it", () => {
    const global = join(directory, "daily-run.lock");
    const linkedGlobal = join(directory, "daily-run-linked.lock");
    const dateLocks = join(directory, "date-locks");
    const fences = join(directory, "fences");
    mkdirSync(dateLocks);
    mkdirSync(fences);
    writeFileSync(global, "sentinel");
    symlinkSync(global, linkedGlobal);

    const result = spawnSync("bash", [
      lockScript(), "--date", "2026-08-01",
      "--date-lock-dir", dateLocks, "--fence-dir", fences,
      "--global-lock", linkedGlobal, "--require-preexisting-authority",
      "--canonical-global-lock", global,
      "--canonical-date-lock-dir", dateLocks,
      "--canonical-fence-dir", fences,
      "--wait-seconds", "1", "--", "bash", "-c", "true",
    ]);

    expect(result.status).toBe(76);
    expect(String(result.stderr)).toContain("cannot be a symlink");
    expect(readFileSync(global, "utf8")).toBe("sentinel");
  });

  const startLocked = (input: {
    date: string;
    name: string;
    holdSeconds: string;
    global: boolean;
  }): ChildProcess => {
    const args = [
      lockScript(),
      "--date", input.date,
      "--date-lock-dir", join(directory, "date-locks"),
      "--fence-dir", join(directory, "fences"),
      "--wait-seconds", "5",
      "--token-output", join(directory, `${input.name}.token`),
      ...(input.global
        ? ["--global-lock", join(directory, "daily-run.lock")]
        : []),
      "--",
      "bash",
      "-c",
      `printf started >'${join(directory, `${input.name}.started`)}'; sleep ${input.holdSeconds}; printf done >'${join(directory, `${input.name}.done`)}'`,
    ];
    return spawn("bash", args, { stdio: "pipe" });
  };
});

const lockScript = (): string => resolve(
  process.cwd(),
  "ops/deploy/production-runtime/reader-summary-date-lock.sh",
);

const completed = (child: ChildProcess): Promise<void> =>
  new Promise((resolveDone, reject) => {
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolveDone();
      else reject(new Error(`date-lock subprocess exited ${code}: ${stderr}`));
    });
  });

const waitFor = async (path: string): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
};
