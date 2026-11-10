import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const COMMIT = /^[0-9a-f]{40}$/u;

/** Only these review prose files are outside build/release/test contracts. */
function isOrdinaryDocumentation(path) {
  return /^docs\/plans\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.md$/u.test(path);
}

/** Keep auth, generated API, native/mobile and dependency changes on full CI. */
function isIsolatedFlutter(path) {
  if (/(?:^|\/)(?:auth|security|credentials|generated_api)(?:\/|\.)/iu.test(path))
    return false;
  if (!/\.(?:dart|arb|svg|png|jpe?g|webp)$/iu.test(path)) return false;
  return (
    /^apps\/frontend\/app\/(?:lib\/src|test|assets)\//u.test(path) ||
    /^apps\/frontend\/features\/(?:feed|interests|summaries)\/(?:lib|test)\//u.test(path) ||
    /^apps\/frontend\/packages\/design_system\/(?:lib|test)\//u.test(path)
  );
}

/** Never treat unknown, mixed server, root or path-traversing changes as light. */
export function classifyChangedPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return "full";
  let frontend = false;
  for (const path of paths) {
    if (
      typeof path !== "string" ||
      !path ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.includes("\uFFFD") ||
      path.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) return "full";
    if (isOrdinaryDocumentation(path)) continue;
    if (isIsolatedFlutter(path)) {
      frontend = true;
      continue;
    }
    return "full";
  }
  return frontend ? "frontend" : "docs";
}

function git(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.error || result.status !== 0 ? null : result.stdout;
}

// Treat mode changes, symlinks and submodules as executable/unsafe inputs.
// Deleted files are absent from one tree; any present file must be regular.
function regularAt(ref, path, cwd) {
  const entry = git(["ls-tree", "-z", ref, "--", path], cwd);
  if (entry === null) return false;
  if (entry.length === 0) return true;
  const text = entry.toString("utf8");
  const rows = text.split("\0");
  return rows.length === 2 && rows[1] === "" &&
    /^100644 blob [a-f0-9]{40}\t/u.test(rows[0]) &&
    rows[0].endsWith("\t" + path);
}

/** Require immutable reviewed merge commit and complete NUL-safe git diff. */
export function changedPaths(base, head, cwd = process.cwd()) {
  if (!COMMIT.test(base) || !COMMIT.test(head)) return null;
  const actual = git(["rev-parse", "HEAD"], cwd);
  if (actual === null || actual.toString("utf8").trim() !== head) return null;
  if (git(["merge-base", "--is-ancestor", base, head], cwd) === null) return null;
  const output = git(["diff", "--name-only", "--no-renames", "-z", base, head], cwd);
  if (output === null) return null;
  const decoded = output.toString("utf8");
  if (decoded.includes("\uFFFD")) return null;
  const paths = decoded.split("\0");
  if (paths.at(-1) === "") paths.pop();
  // Bound work and verify both Git tree modes; docs-only paths must not be
  // symlinks, executable files or gitlinks. All uncertainty => full.
  if (paths.length > 100) return null;
  if (classifyChangedPaths(paths) !== "full" &&
      paths.some((path) => !regularAt(base, path, cwd) || !regularAt(head, path, cwd)))
    return null;
  return paths;
}

function main() {
  const event = process.env.GITHUB_EVENT_NAME;
  const paths =
    event === "pull_request"
      ? changedPaths(process.env.CI_BASE_SHA, process.env.GITHUB_SHA)
      : null;
  // merge_group, main push and workflow_dispatch are always full qualification.
  const tier =
    event === "pull_request" && paths !== null
      ? classifyChangedPaths(paths)
      : "full";
  const reason =
    event !== "pull_request"
      ? "main/merge queue/manual: full"
      : paths === null
        ? "untrusted/unavailable Git range: full"
        : "classified from complete reviewed merge diff";
  process.stdout.write(`CI impact: ${tier} (${reason})\n`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `tier=${tier}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `CI impact: **${tier}** — ${reason}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
