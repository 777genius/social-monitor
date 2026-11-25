import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep as pathSeparator,
} from "node:path";

export function assertPrivateEvaluationFile(
  path: string,
  label = path,
): string {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    throw new Error(`${label} is missing`);
  }
  if (lstatSync(absolutePath).isSymbolicLink()) {
    throw new Error(`${label} must not be a symlink`);
  }

  const realPath = realpathSync(absolutePath);
  if (realPath !== canonicalPathAllowingPlatformTempAlias(absolutePath)) {
    throw new Error(`${label} must not use symlinked path components`);
  }
  const stats = statSync(realPath);
  if (!stats.isFile()) {
    throw new Error(`${label} realpath must point to a regular file`);
  }
  assertPathOutsideGitWorktrees(realPath, `${label} realpath`);
  if ((stats.mode & 0o400) === 0 || (stats.mode & 0o077) !== 0) {
    throw new Error(
      `${label} must use owner-readable, owner-only private file permissions`,
    );
  }
  const currentUid = process.getuid?.();
  if (currentUid !== undefined && stats.uid !== currentUid) {
    throw new Error(`${label} must be owned by the current user`);
  }

  return realPath;
}

function canonicalPathAllowingPlatformTempAlias(path: string): string {
  const temporaryRoot = resolve(tmpdir());
  if (!isPathInside(temporaryRoot, path)) {
    return path;
  }
  return resolve(realpathSync(temporaryRoot), relative(temporaryRoot, path));
}

export function assertPathOutsideGitWorktrees(
  realPath: string,
  label: string,
): void {
  const worktreeRoot = findGitWorktreeRoot(dirname(realPath));
  if (worktreeRoot !== undefined && isPathInside(worktreeRoot, realPath)) {
    throw new Error(
      `${label} must be outside every Git worktree: ${worktreeRoot}`,
    );
  }
}

function findGitWorktreeRoot(startPath: string): string | undefined {
  let current = realpathSync(startPath);
  for (;;) {
    if (isGitWorktreeMarker(join(current, ".git"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function isGitWorktreeMarker(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  const stats = lstatSync(path);
  if (stats.isDirectory()) {
    return existsSync(join(path, "HEAD"));
  }
  if (!stats.isFile()) {
    return false;
  }
  const marker = readFileSync(path, "utf8").trim();
  const match = /^gitdir:\s*(.+)$/u.exec(marker);
  if (match?.[1] === undefined) {
    return false;
  }
  const gitDirectory = isAbsolute(match[1])
    ? match[1]
    : resolve(dirname(path), match[1]);
  return existsSync(join(gitDirectory, "HEAD"));
}

function isPathInside(root: string, path: string): boolean {
  const relativePath = relative(root, path);
  return relativePath === "" ||
    (!isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${pathSeparator}`));
}
