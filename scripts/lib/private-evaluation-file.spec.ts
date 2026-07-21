import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertPrivateEvaluationFile } from "./private-evaluation-file";

describe("private evaluation file validation", () => {
  it("accepts an owner-only regular file outside Git worktrees", () => {
    const root = mkdtempSync(join(tmpdir(), "private-evaluation-file-"));
    const path = join(root, "manifest.json");
    writeFileSync(path, "{}\n", { mode: 0o600 });

    expect(assertPrivateEvaluationFile(path)).toBe(path);
  });

  it.each([0o640, 0o604])(
    "rejects group/world-readable mode %s",
    (mode) => {
      const root = mkdtempSync(join(tmpdir(), "private-evaluation-mode-"));
      const path = join(root, "manifest.json");
      writeFileSync(path, "{}\n", { mode: 0o600 });
      chmodSync(path, mode);

      expect(() => assertPrivateEvaluationFile(path)).toThrow(
        "owner-readable, owner-only private file permissions",
      );
    },
  );

  it("rejects a symlink even when its target is private and external", () => {
    const root = mkdtempSync(join(tmpdir(), "private-evaluation-link-"));
    const target = join(root, "manifest.json");
    const alias = join(root, "manifest-alias.json");
    writeFileSync(target, "{}\n", { mode: 0o600 });
    symlinkSync(target, alias);

    expect(() => assertPrivateEvaluationFile(alias)).toThrow(
      "must not be a symlink",
    );

    const directoryAlias = `${root}-directory-alias`;
    symlinkSync(root, directoryAlias);
    expect(() =>
      assertPrivateEvaluationFile(join(directoryAlias, "manifest.json")),
    ).toThrow("must not use symlinked path components");
  });

  it("rejects Git-tracked paths and non-files before consumption", () => {
    expect(() =>
      assertPrivateEvaluationFile(join(process.cwd(), "package.json")),
    ).toThrow("must be outside every Git worktree");

    const root = mkdtempSync(join(tmpdir(), "private-evaluation-directory-"));
    const directory = join(root, "manifest.json");
    mkdirSync(directory);
    expect(() => assertPrivateEvaluationFile(directory)).toThrow(
      "realpath must point to a regular file",
    );
  });
});
