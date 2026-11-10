import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { changedPaths, classifyChangedPaths } from "./ci-impact.mjs";

const cases = [
  ["empty changes must be full", [], "full"],
  ["ordinary plan", ["docs/plans/feature-proposal.md"], "docs"],
  ["multiple plans", ["docs/plans/a.md", "docs/plans/b.md"], "docs"],
  ["nested plan is not trusted docs", ["docs/plans/nested/contract.md"], "full"],
  ["readme is a tested input", ["README.md"], "full"],
  ["agent instructions", ["AGENTS.md"], "full"],
  ["changes to this CI plan and workflow are full", ["docs/plans/ci.md", ".github/workflows/pull-request.yml"], "full"],
  ["release evidence is full", ["docs/operations/release.md"], "full"],
  ["documentation markdown outside approved set is full", ["docs/ci/constraints.md"], "full"],
  ["documentation plus backend is full", ["docs/plans/a.md", "apps/api-gateway/main.ts"], "full"],
  ["Flutter UI app presentation", ["apps/frontend/app/lib/src/presentation/home.dart"], "frontend"],
  ["Flutter tests and images", ["apps/frontend/app/test/home_test.dart", "apps/frontend/app/assets/logo.png"], "frontend"],
  ["Flutter feature feeds", ["apps/frontend/features/feed/lib/view.dart"], "frontend"],
  ["Flutter design system", ["apps/frontend/packages/design_system/lib/card.dart"], "frontend"],
  ["docs plus Flutter stays frontend", ["docs/plans/a.md", "apps/frontend/app/lib/src/view.dart"], "frontend"],
  ["Flutter generated API requires full", ["apps/frontend/packages/generated_api/lib/client.dart"], "full"],
  ["Flutter auth requires full", ["apps/frontend/features/auth/lib/login.dart"], "full"],
  ["Flutter sensitive presentation requires full", ["apps/frontend/app/lib/src/security/credentials.dart"], "full"],
  ["Flutter runtime dependency requires full", ["apps/frontend/app/pubspec.yaml"], "full"],
  ["Flutter native code requires full", ["apps/frontend/app/android/app/build.gradle"], "full"],
  ["Flutter non-approved settings feature requires full", ["apps/frontend/features/settings/lib/prefs.dart"], "full"],
  ["backend and Flutter is full", ["apps/frontend/features/feed/lib/feed.dart", "apps/api-gateway/src/index.ts"], "full"],
  ["SQL migration is full", ["prisma/migrations/001.sql"], "full"],
  ["CI policy is full", ["scripts/ci/ci-impact.mjs"], "full"],
  ["workflow is full", [".github/workflows/coverage.yml"], "full"],
  ["dependencies full", ["package-lock.json"], "full"],
  ["absolute path full", ["/docs/plans/test.md"], "full"],
  ["path traversal full", ["docs/plans/../safe.md"], "full"],
  ["windows slash full", ["docs\\plans\\a.md"], "full"],
  ["unicode malformed full", ["docs/plans/bad\uFFFD.md"], "full"],
  ["non-string full", [null], "full"],
  ["dot element full", ["./docs/plans/a.md"], "full"],
];
for (const [name, paths, expected] of cases)
  test(name, () => assert.equal(classifyChangedPaths(paths), expected));

test("real Git diff treats moved docs into source as full", () => {
  const cwd = mkdtempSync(join(tmpdir(), "social-ci-impact-"));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], {encoding:"utf8"}).trim();
  const commit = (message) => {
    git("add", "-A");
    git("-c", "user.name=CI", "-c", "user.email=ci@example.invalid", "commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-q");
    mkdirSync(join(cwd, "docs/plans"), {recursive:true});
    writeFileSync(join(cwd, "docs/plans/guide.md"), "guide\n");
    const base = commit("docs");
    mkdirSync(join(cwd, "apps/api-gateway"), {recursive:true});
    rmSync(join(cwd, "docs/plans/guide.md"));
    writeFileSync(join(cwd, "apps/api-gateway/integrity.ts"), "export {};\n");
    const head = commit("move");
    const paths = changedPaths(base, head, cwd);
    assert.deepEqual(paths?.sort(), ["docs/plans/guide.md", "apps/api-gateway/integrity.ts"].sort());
    assert.equal(classifyChangedPaths(paths), "full");
    assert.equal(changedPaths("wrong", head, cwd), null);
    assert.equal(changedPaths(base, base, cwd), null);
    assert.equal(changedPaths(head, base, cwd), null);
  } finally {
    rmSync(cwd, {recursive:true, force:true});
  }
});

test("changed documentation mode or symlink cannot enter light PR lane", (t) => {
  if (process.platform === "win32") return t.skip("POSIX file-mode proof");
  const cwd = mkdtempSync(join(tmpdir(), "social-ci-modes-"));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
  const commit = (message) => {
    git("add", "-A");
    git("-c", "user.name=CI", "-c", "user.email=ci@example.invalid", "commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-q");
    mkdirSync(join(cwd, "docs/plans"), { recursive: true });
    const file = join(cwd, "docs/plans/proof.md");
    writeFileSync(file, "Regular plan\n");
    const base = commit("regular plan");
    chmodSync(file, 0o755);
    const executable = commit("executable plan");
    assert.equal(changedPaths(base, executable, cwd), null);
    chmodSync(file, 0o644);
    rmSync(file);
    symlinkSync("../guide.md", file);
    const linked = commit("symlinked plan");
    assert.equal(changedPaths(base, linked, cwd), null);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
