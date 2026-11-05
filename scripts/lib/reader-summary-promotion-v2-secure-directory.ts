import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";

export type SecureDirectoryHandle = Readonly<{
  fd: number;
  fdPath: string;
  canonicalPath: string;
  identity: string;
  close: () => void;
}>;

export const openSecureDirectory = (
  path: string,
  create = false,
): SecureDirectoryHandle => {
  const canonicalPath = resolve(path);
  if (create) mkdirSync(canonicalPath, { recursive: true, mode: 0o700 });
  const fdRelativePath = /^\/proc\/self\/fd\/\d+(?:\/|$)/u.test(
    canonicalPath,
  );
  const expected = lstatSync(canonicalPath);
  if (expected.isSymbolicLink() || !expected.isDirectory() ||
      (!fdRelativePath && realpathSync(canonicalPath) !== canonicalPath)) {
    throw new Error("Historical promotion output directory is not canonical");
  }
  const fd = openSync(
    canonicalPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  let identity: string;
  try {
    const opened = fstatSync(fd);
    const named = statSync(canonicalPath);
    if (!opened.isDirectory() || opened.dev !== expected.dev ||
        opened.ino !== expected.ino || opened.dev !== named.dev ||
        opened.ino !== named.ino) {
      throw new Error("Historical promotion output directory changed on open");
    }
    identity = `${opened.dev}:${opened.ino}:${mountIdentity(fd)}`;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  let closed = false;
  return {
    fd,
    fdPath: `/proc/self/fd/${fd}`,
    canonicalPath,
    identity,
    close: () => {
      if (!closed) closeSync(fd);
      closed = true;
    },
  };
};

const mountIdentity = (fd: number): string => {
  const match = readFileSync(`/proc/self/fdinfo/${fd}`, "utf8")
    .match(/^mnt_id:\s*(\d+)$/mu);
  if (match?.[1] === undefined) {
    throw new Error("Historical promotion output mount identity is unavailable");
  }
  return match[1];
};
