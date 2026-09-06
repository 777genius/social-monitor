import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { refreshBytesHash, refreshHash, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";

// These source roots exist in both the checkout and the canonical daily-runner
// image. Admission imports src policy and bin/reader-promotion-v2-canary-contract.cjs.
// Root dist/build/coverage/node_modules/.cache and Git metadata are not source.
const refreshSourceRoots = ["libs", "scripts", "prisma", "apps/agent-runtime"] as const;
const refreshSourceConfig = ["package.json", "package-lock.json", "tsconfig.json", "tsconfig.build.json",
  "prisma.config.ts"] as const;
const refreshRequiredSource = [
  "libs/shared-kernel/src/index.ts",
  "libs/summary/application/contracts/reader-summary-new-input-refresh-authority.ts",
  "libs/contracts/generated/grpc/agent_runtime/v1/agent_runtime.ts",
  "scripts/run-reader-summary-new-input-refresh.ts",
  "scripts/lib/reader-summary-new-input-refresh-files.ts",
  "scripts/lib/reader-summary-new-input-refresh-model.ts",
  "apps/agent-runtime/src/subscription-runtime-purpose-model-policy.ts",
  "apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs",
  "prisma/schema.prisma",
] as const;

export function refreshSourceSha256(root = process.cwd()): string {
  const absoluteRoot = resolve(root);
  if (realpathSync(absoluteRoot) !== absoluteRoot) throw new Error("Refresh source root must not contain symlinks");
  const paths: string[] = [];
  const walk = (path: string): void => {
    const absolute = join(absoluteRoot, path);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink() || realpathSync(absolute) !== absolute) {
      throw new Error(`Refresh source must not contain symlinks: ${path}`);
    }
    if (!stat.isDirectory() && !stat.isFile()) throw new Error(`Refresh source must be regular: ${path}`);
    // Preserve the test-only exclusions. Only Prisma's generated dependency is
    // excluded: libs/contracts/generated contains imported runtime contracts.
    // Do not ignore extensions or nested build/cache/node_modules directories:
    // e.g. an untracked sibling .js or package.json can change Node resolution.
    if (path === "prisma/generated" || path.includes(".spec.") ||
        path.split("/").some((part) => part === "test-fixtures" || part === "test-support")) return;
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) walk(`${path}/${name}`);
    } else paths.push(path);
  };
  for (const path of refreshSourceRoots) {
    if (!lstatSync(join(absoluteRoot, path)).isDirectory()) throw new Error(`Refresh source root missing: ${path}`);
    walk(path);
  }
  for (const path of refreshSourceConfig) {
    if (!lstatSync(join(absoluteRoot, path)).isFile()) throw new Error(`Refresh source config missing: ${path}`);
    walk(path);
  }
  for (const path of refreshRequiredSource) {
    if (!paths.includes(path)) throw new Error(`Refresh required source missing: ${path}`);
  }
  const files = paths.sort().map((path) => {
    const fd = openSync(join(absoluteRoot, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      if (!fstatSync(fd).isFile()) throw new Error(`Refresh source must be regular: ${path}`);
      return [path, refreshBytesHash(readFileSync(fd))];
    } finally { closeSync(fd); }
  });
  return refreshHash({ format: "reader-summary-source-inventory-v2", files });
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
