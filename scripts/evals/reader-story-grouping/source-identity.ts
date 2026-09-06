import { execFileSync } from "node:child_process";
import { check } from "./dataset";

/** The capture stays frozen; every execution uses a separate, clean committed source identity. */
export type EvaluatedSource = {
  revision: string;
  treeSha: string;
  worktree: "clean";
};

export const assertSource = (root = process.cwd()): EvaluatedSource => {
  const git = (...args: string[]): string => execFileSync("git", args, {
    cwd: root, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
  const revision = git("rev-parse", "HEAD");
  // Capture origin is sealed fixture provenance, not implementation ancestry authority.
  // Bind the current commit/tree even when shallow history omits that old Git object.
  check(git("status", "--porcelain=v1", "--untracked-files=all") === "",
    "Evaluation requires a clean committed checkout; commit source/evaluator changes before running");
  // Ignored executable files can shadow committed TypeScript during Node resolution.
  // Output/dependency caches are outside these source roots and remain permitted.
  const ignored = git("ls-files", "--others", "--ignored", "--exclude-standard", "--",
    "libs", "apps/agent-runtime/src", "scripts/evals/reader-story-grouping", "test/evals/reader-story-grouping");
  check(!ignored.split("\n").some((path) => /\.(?:[cm]?[jt]s|json)$/.test(path)),
    "Ignored source files could shadow evaluated code; use a fresh clean checkout");
  return { revision, treeSha: git("rev-parse", "HEAD^{tree}"), worktree: "clean" };
};

export const verifySourceUnchanged = (expected: EvaluatedSource): void => {
  const actual = assertSource();
  check(actual.revision === expected.revision && actual.treeSha === expected.treeSha,
    "Evaluated source changed during execution; discard this run and restart on a clean commit");
};
