import { execFileSync } from "node:child_process";
import { fstatSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { refreshBytesHash, refreshHash, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";

export function refreshSourceSha256(): string {
  const paths = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard",
    "libs", "scripts", "prisma", "package.json", "package-lock.json"], { encoding: "utf8" })
    .split("\0").filter((p) => p && !p.includes(".spec.") && !p.includes("test-fixtures/") &&
      !p.includes("test-support/") && !p.startsWith("prisma/generated/"));
  return refreshHash([...new Set(paths)].sort().map((p) => [p, refreshBytesHash(readFileSync(p))]));
}
export function readReviewedRefresh(path: string, sha256: string): RefreshManifest {
  const absolute = resolve(path);
  if (realpathSync(absolute) !== absolute || !lstatSync(absolute).isFile() ||
      lstatSync(absolute).nlink !== 1 || (lstatSync(absolute).mode & 0o222) !== 0) throw new Error("Refresh manifest must be a regular immutable file");
  const bytes = readFileSync(absolute);
  if (refreshBytesHash(bytes) !== sha256) throw new Error("Reviewed refresh manifest hash differs");
  return JSON.parse(bytes.toString("utf8")) as RefreshManifest;
}
export type RefreshFenceAuthority = Readonly<{
  globalLock: string; dateDirectory: string; fenceDirectory: string;
}>;
export function readRefreshFenceAuthority(paths: RefreshFenceAuthority): RefreshManifest["fenceAuthority"] {
  const identify = (path: string) => {
    if (!path.startsWith("/") || realpathSync(path) !== path) throw new Error("Refresh requires existing canonical fence paths");
    const stat = lstatSync(path);
    return `${stat.dev}:${stat.ino}`;
  };
  return { global: identify(paths.globalLock), dates: identify(paths.dateDirectory), fences: identify(paths.fenceDirectory) };
}
export function assertRefreshFences(date: string, paths: RefreshFenceAuthority,
  token: string | undefined, expected: RefreshManifest["fenceAuthority"]): void {
  if (refreshHash(readRefreshFenceAuthority(paths)) !== refreshHash(expected)) throw new Error("Refresh reviewed fence authority drifted");
  for (const [fd, path] of [[8, paths.globalLock], [6, paths.dateDirectory],
    [5, paths.fenceDirectory], [7, join(paths.dateDirectory, `${date}.lock`)]] as const) {
    if (!path.startsWith("/") || realpathSync(path) !== path) throw new Error("Refresh canonical fence path invalid");
    const actual = fstatSync(fd), expected = statSync(path);
    if (actual.dev !== expected.dev || actual.ino !== expected.ino) throw new Error("Refresh fence inode drifted");
    if ((fd === 7 || fd === 8) &&
        !/lock:\s+\d+: FLOCK\s+ADVISORY\s+WRITE/u.test(readFileSync(`/proc/self/fdinfo/${fd}`, "utf8"))) {
      throw new Error("Refresh requires held global and date flocks");
    }
  }
  const counterPath = join(paths.fenceDirectory, `${date}.counter`);
  if (lstatSync(counterPath).isSymbolicLink()) throw new Error("Refresh fence counter is a symlink");
  const counter = readFileSync(counterPath, "utf8").trim();
  if (!/^[1-9]\d*$/u.test(counter) || token !== `reader-summary-date:${date}:${counter}`) {
    throw new Error("Refresh fence token drifted");
  }
}
