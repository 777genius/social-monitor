import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { refreshSourceSha256 } from "./reader-summary-new-input-refresh-files";
import { assertRefreshEqual, NewInputRefreshGuard } from "./reader-summary-new-input-refresh-guard";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { refreshOperation } from "./reader-summary-new-input-refresh-manifest";

const requiredFiles = [
  "package.json", "package-lock.json", "tsconfig.json", "tsconfig.build.json", "prisma.config.ts",
  "libs/shared-kernel/src/index.ts",
  "libs/summary/application/contracts/reader-summary-new-input-refresh-authority.ts",
  "libs/contracts/generated/grpc/agent_runtime/v1/agent_runtime.ts",
  "scripts/run-reader-summary-new-input-refresh.ts",
  "scripts/lib/reader-summary-new-input-refresh-files.ts",
  "scripts/lib/reader-summary-new-input-refresh-model.ts",
  "apps/agent-runtime/src/subscription-runtime-purpose-model-policy.ts",
  "apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs",
  "prisma/schema.prisma",
];

describe("packaged refresh source identity", () => {
  const roots: string[] = [];
  function disposable(): string {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "refresh-source-inventory-")));
    roots.push(root);
    return root;
  }
  function put(root: string, path: string, bytes = `source:${path}\n`): void {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  }
  function fixture(files = requiredFiles): string {
    const root = disposable();
    for (const path of files) put(root, path);
    return root;
  }
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("hashes the same relative paths and bytes regardless of creation order, location or file mode", () => {
    const a = fixture(), b = fixture([...requiredFiles].reverse());
    for (const path of requiredFiles) chmodSync(join(b, path), 0o444);
    expect(refreshSourceSha256(a)).toMatch(/^[0-9a-f]{64}$/u);
    expect(refreshSourceSha256(a)).toBe(refreshSourceSha256(b));
  });

  it.each(requiredFiles)("binds required source/config bytes: %s", (path) => {
    const root = fixture(), before = refreshSourceSha256(root);
    put(root, path, "changed bytes\n");
    expect(refreshSourceSha256(root)).not.toBe(before);
  });

  it.each(requiredFiles)("rejects missing required file: %s", (path) => {
    const root = fixture();
    rmSync(join(root, path));
    expect(() => refreshSourceSha256(root)).toThrow();
  });

  it.each(["libs", "scripts", "prisma", "apps/agent-runtime"])("rejects missing or empty source root: %s", (path) => {
    const root = fixture();
    rmSync(join(root, path), { recursive: true });
    expect(() => refreshSourceSha256(root)).toThrow();
    mkdirSync(join(root, path), { recursive: true });
    expect(() => refreshSourceSha256(root)).toThrow(/required source missing/);
  });

  it("rejects an empty tree", () => {
    expect(() => refreshSourceSha256(disposable())).toThrow();
  });

  it("binds additions, renames and deletions, including files ignored by Git", () => {
    const root = fixture(), original = refreshSourceSha256(root);
    put(root, ".gitignore", "*.js\n");
    const path = "scripts/lib/untracked-runtime.js";
    put(root, path, "module.exports = 1;\n");
    const added = refreshSourceSha256(root);
    expect(added).not.toBe(original);
    renameSync(join(root, path), join(root, "scripts/lib/renamed-runtime.js"));
    expect(refreshSourceSha256(root)).not.toBe(added);
    rmSync(join(root, "scripts/lib/renamed-runtime.js"));
    expect(refreshSourceSha256(root)).toBe(original);
  });

  it.each([
    "scripts/lib/reader-summary-new-input-refresh-model.js",
    "scripts/lib/package.json",
    "scripts/lib/node_modules/shadow/index.js",
    "libs/summary/application/contracts/reader-summary-new-input-refresh-authority.js",
    "apps/agent-runtime/src/subscription-runtime-purpose-model-policy.js",
    "apps/agent-runtime/src/extra.cjs",
    "apps/agent-runtime/package.json",
    "libs/contracts/generated/runtime.mjs",
    "libs/summary/.cache/executable.js",
    "libs/summary/dist/executable.js",
    "libs/summary/build/package.json",
  ])("does not hide executable or resolution shadows: %s", (path) => {
    const root = fixture(), before = refreshSourceSha256(root);
    put(root, path, "shadow bytes\n");
    expect(refreshSourceSha256(root)).not.toBe(before);
  });

  it("ignores only out-of-scope outputs and the established test/Prisma dependency exclusions", () => {
    const root = fixture(), before = refreshSourceSha256(root);
    for (const path of [
      ".git/HEAD", ".git/index", ".cache/source-inventory-evidence.json", "coverage/coverage.json",
      "dist/scripts/run-reader-summary-new-input-refresh.js", "build/runtime.js",
      "node_modules/dependency/index.js", "prisma/generated/client/client.ts",
      "scripts/lib/new.spec.ts", "libs/summary/test-fixtures/example.json", "libs/delivery/test-support/helper.ts",
    ]) put(root, path, "generated/test metadata\n");
    expect(refreshSourceSha256(root)).toBe(before);
    rmSync(join(root, ".git"), { recursive: true });
    put(root, ".git", "gitdir: /unavailable/worktree/metadata\n");
    expect(refreshSourceSha256(root)).toBe(before);
  });

  it.each([
    "libs", "apps", "apps/agent-runtime/src", "tsconfig.json",
    "scripts/run-reader-summary-new-input-refresh.ts", "libs/new-runtime.ts", "prisma/generated",
  ])("rejects symlink escapes without following them: %s", (path) => {
    const root = fixture(), outside = disposable();
    rmSync(join(root, path), { recursive: true, force: true });
    symlinkSync(outside, join(root, path));
    expect(() => refreshSourceSha256(root)).toThrow();
  });

  it("rejects internal, dangling and root symlinks too", () => {
    const root = fixture(), alias = join(disposable(), "alias");
    symlinkSync(root, alias);
    expect(() => refreshSourceSha256(alias)).toThrow(/symlinks/);
    symlinkSync(join(root, "scripts/run-reader-summary-new-input-refresh.ts"), join(root, "scripts/alias.ts"));
    expect(() => refreshSourceSha256(root)).toThrow(/symlinks/);
    rmSync(join(root, "scripts/alias.ts"));
    symlinkSync(join(root, "absent"), join(root, "scripts/dangling.ts"));
    expect(() => refreshSourceSha256(root)).toThrow(/symlinks/);
  });

  it("invalidates reviewed source authority before a guarded effect and keeps it invalid", async () => {
    const root = fixture(), sourceSha256 = refreshSourceSha256(root);
    const manifest = { ...refreshManifest(), sourceSha256, deployedSourceSha256: sourceSha256 };
    manifest.operation = refreshOperation(manifest);
    const path = "apps/agent-runtime/src/subscription-runtime-purpose-model-policy.ts";
    const original = readFileSync(join(root, path));
    const effect = jest.fn();
    const guard = new NewInputRefreshGuard(manifest, "job", {
      now: () => refreshNow, assertFences: () => undefined,
      assertCurrent: async () => assertRefreshEqual(refreshSourceSha256(root), manifest.sourceSha256, "source"),
    });
    await expect(guard.assertCurrent()).resolves.toBeUndefined();
    put(root, path, "changed admission\n");
    await expect(guard.assertCurrent().then(effect)).rejects.toThrow(/source drifted/);
    writeFileSync(join(root, path), original);
    await expect(guard.assertCurrent().then(effect)).rejects.toThrow(/reconciliation/);
    expect(effect).not.toHaveBeenCalled();
  });

  it("runs the actual CLI with tsconfig.build.json without Git metadata or a Git binary", () => {
    const root = disposable(), emptyPath = disposable(), repository = resolve(__dirname, "../..");
    for (const path of ["libs", "scripts", "prisma", "apps/agent-runtime", ...requiredFiles.slice(0, 5)]) {
      cpSync(join(repository, path), join(root, path), { recursive: true });
    }
    symlinkSync(realpathSync(join(repository, "node_modules")), join(root, "node_modules"));
    const noGitEnv = { PATH: emptyPath, NODE_ENV: "test" };
    expect(spawnSync("git", ["--version"], { env: noGitEnv }).error).toHaveProperty("code", "ENOENT");
    const args = [join(root, "node_modules/ts-node/dist/bin.js"), "-P", "tsconfig.build.json",
      "-r", "tsconfig-paths/register", "scripts/run-reader-summary-new-input-refresh.ts", "--source-sha256"];
    const run = (env: NodeJS.ProcessEnv) => execFileSync(process.execPath, args, {
      cwd: root, env, encoding: "utf8", timeout: 60_000,
    }).trim();
    const withoutGit = run(noGitEnv);
    expect(withoutGit).toBe(refreshSourceSha256(root));
    // Git's private metadata is immaterial, whether a directory or worktree file.
    put(root, ".git/HEAD", "ref: refs/heads/main\n");
    put(root, ".git/config", "[core]\nrepositoryformatversion = 0\n");
    expect(run({ PATH: process.env.PATH, NODE_ENV: "test" })).toBe(withoutGit);
  }, 150_000);
});
