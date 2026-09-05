import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { readReviewedRefresh, readRefreshFenceAuthority } from "./reader-summary-new-input-refresh-files";
import { refreshBytesHash } from "./reader-summary-new-input-refresh-manifest";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";

describe("reviewed immutable refresh files and real locks", () => {
  const roots: string[] = [];
  const root = () => { const p = mkdtempSync(join(tmpdir(), "summary-refresh-test-")); roots.push(p); return p; };
  afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
  it("rejects tampered, mutable and symlinked manifests", () => {
    const dir = root(), path = join(dir, "manifest.json");
    const bytes = Buffer.from(JSON.stringify(refreshManifest()));
    writeFileSync(path, bytes, { mode: 0o400 });
    expect(readReviewedRefresh(path, refreshBytesHash(bytes))).toEqual(refreshManifest());
    expect(() => readReviewedRefresh(path, "f".repeat(64))).toThrow(/hash/);
    symlinkSync(path, join(dir, "alias"));
    expect(() => readReviewedRefresh(join(dir, "alias"), refreshBytesHash(bytes))).toThrow();
    chmodSync(path, 0o600);
    expect(() => readReviewedRefresh(path, refreshBytesHash(bytes))).toThrow(/immutable/);
  });
  it("requires canonical global/date flocks and detects counter drift", () => {
    const dir = root();
    const paths = { globalLock: join(dir, "global.lock"), dateDirectory: join(dir, "dates"), fenceDirectory: join(dir, "fences") };
    writeFileSync(paths.globalLock, ""); mkdirSync(paths.dateDirectory); mkdirSync(paths.fenceDirectory);
    const authority = readRefreshFenceAuthority(paths);
    const code = `require('ts-node').register({ transpileOnly: true, project: 'tsconfig.build.json' }); require('tsconfig-paths/register');
      const { assertRefreshFences } = require('./scripts/lib/reader-summary-new-input-refresh-files');
      const fs = require('node:fs'); const paths = JSON.parse(process.env.TEST_REFRESH_FENCES);
      const expected = JSON.parse(process.env.TEST_REFRESH_FENCE_AUTHORITY);
      assertRefreshFences('2026-09-03', paths, process.env.READER_SUMMARY_DATE_FENCE_TOKEN, expected);
      fs.writeFileSync(paths.fenceDirectory + '/2026-09-03.counter', '2');
      let rejected = false;
      try { assertRefreshFences('2026-09-03', paths, process.env.READER_SUMMARY_DATE_FENCE_TOKEN, expected); }
      catch { rejected = true; }
      if (!rejected) throw new Error('counter drift accepted');`;
    execFileSync("bash", ["ops/deploy/production-runtime/reader-summary-date-lock.sh", "--date", "2026-09-03",
      "--global-lock", paths.globalLock, "--date-lock-dir", paths.dateDirectory, "--fence-dir", paths.fenceDirectory,
      "--require-preexisting-authority", "--canonical-global-lock", paths.globalLock,
      "--canonical-date-lock-dir", paths.dateDirectory, "--canonical-fence-dir", paths.fenceDirectory,
      "--", process.execPath, "-e", code], { env: { ...process.env, TEST_REFRESH_FENCES: JSON.stringify(paths),
      TEST_REFRESH_FENCE_AUTHORITY: JSON.stringify(authority) }, timeout: 30_000, stdio: "pipe" });
    expect(readFileSync(join(paths.fenceDirectory, "2026-09-03.counter"), "utf8")).toBe("2");
  });
});
