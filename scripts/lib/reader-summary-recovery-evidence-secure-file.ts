import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { BigIntStats } from "node:fs";
import { basename, dirname, isAbsolute, parse, resolve, sep } from "node:path";

export type RecoveryEvidenceFilesystemCheckpoint =
  | "parent_opened"
  | "file_opened"
  | "file_read"
  | "file_created";

export type RecoveryEvidenceFilesystemCheckpointHandler = (
  checkpoint: RecoveryEvidenceFilesystemCheckpoint,
) => void;

type FileStamp = Readonly<{
  device: bigint;
  inode: bigint;
  mode: bigint;
  owner: bigint;
  size: bigint;
  modifiedNanoseconds: bigint;
  changedNanoseconds: bigint;
}>;

type TrustedParent = Readonly<{
  descriptor: number;
  path: string;
  leafName: string;
  stamp: FileStamp;
}>;

const procDescriptorRoot = "/proc/self/fd";

export const readSecureRecoveryEvidenceFile = (params: {
  readonly path: string;
  readonly label: string;
  readonly checkpoint?: RecoveryEvidenceFilesystemCheckpointHandler;
}): Buffer => {
  const trustedParent = openTrustedParent(params.path, false);
  try {
    params.checkpoint?.("parent_opened");
    assertTrustedParentStillNamed(trustedParent);
    return readAnchoredRegularFile({
      trustedParent,
      label: params.label,
      checkpoint: params.checkpoint,
    });
  } finally {
    closeSync(trustedParent.descriptor);
  }
};

export const installSecureRecoveryEvidenceFile = (params: {
  readonly path: string;
  readonly label: string;
  readonly bytes: Buffer;
  readonly checkpoint?: RecoveryEvidenceFilesystemCheckpointHandler;
}): "installed" | "replayed" => {
  const trustedParent = openTrustedParent(params.path, true);
  let descriptor: number | undefined;
  let createdStamp: FileStamp | undefined;
  try {
    params.checkpoint?.("parent_opened");
    assertTrustedParentStillNamed(trustedParent);
    try {
      descriptor = openAnchoredLeaf(
        trustedParent,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o400,
      );
      createdStamp = assertSecureRegularFile(
        fstatSync(descriptor, { bigint: true }),
        params.label,
      );
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const existing = readAnchoredRegularFile({
        trustedParent,
        label: params.label,
        checkpoint: params.checkpoint,
      });
      if (!existing.equals(params.bytes)) {
        fail(`${params.label} already exists with different bytes`);
      }
      return "replayed";
    }

    params.checkpoint?.("file_created");
    writeFileSync(descriptor, params.bytes);
    fchmodSync(descriptor, 0o400);
    fsyncSync(descriptor);
    const installedStamp = assertSecureRegularFile(
      fstatSync(descriptor, { bigint: true }),
      params.label,
    );
    closeSync(descriptor);
    descriptor = undefined;
    fsyncSync(trustedParent.descriptor);
    assertTrustedParentStillNamed(trustedParent);
    const installed = readAnchoredRegularFile({
      trustedParent,
      label: params.label,
      expectedStamp: installedStamp,
    });
    if (!installed.equals(params.bytes)) {
      fail(`${params.label} changed while it was installed`);
    }
    return "installed";
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (createdStamp !== undefined) {
      unlinkAnchoredIfSameFile(trustedParent, createdStamp);
    }
    throw error;
  } finally {
    closeSync(trustedParent.descriptor);
  }
};

export const ensureSecureRecoveryEvidenceParent = (path: string): void => {
  const trustedParent = openTrustedParent(path, true);
  try {
    assertTrustedParentStillNamed(trustedParent);
  } finally {
    closeSync(trustedParent.descriptor);
  }
};

const readAnchoredRegularFile = (params: {
  readonly trustedParent: TrustedParent;
  readonly label: string;
  readonly expectedStamp?: FileStamp;
  readonly checkpoint?: RecoveryEvidenceFilesystemCheckpointHandler;
}): Buffer => {
  let descriptor: number | undefined;
  try {
    descriptor = openAnchoredLeaf(
      params.trustedParent,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const before = assertSecureRegularFile(
      fstatSync(descriptor, { bigint: true }),
      params.label,
    );
    if (
      params.expectedStamp !== undefined &&
      !sameFileState(params.expectedStamp, before)
    ) {
      fail(`${params.label} changed while it was installed`);
    }
    params.checkpoint?.("file_opened");
    const bytes = readFileSync(descriptor);
    const after = fileStamp(fstatSync(descriptor, { bigint: true }));
    if (!sameFileState(before, after)) {
      fail(`${params.label} changed while it was read`);
    }
    params.checkpoint?.("file_read");
    assertTrustedParentStillNamed(params.trustedParent);
    assertAnchoredLeafStillNamed(params.trustedParent, before, params.label);
    return bytes;
  } catch (error) {
    if (isSecureFilesystemError(error)) throw error;
    if (errorCode(error) === "ELOOP" || errorCode(error) === "ENOTDIR") {
      fail(`${params.label} must be a regular non-symlink file`);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

const openTrustedParent = (
  path: string,
  createMissing: boolean,
): TrustedParent => {
  assertLinuxDescriptorFilesystem();
  const absolute = exactAbsolutePath(path);
  const parentPath = dirname(absolute);
  const leafName = basename(absolute);
  assertSafeName(leafName);
  const root = parse(absolute).root;
  let descriptor = openSync(
    root,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    assertSecureDirectory(fstatSync(descriptor, { bigint: true }), root);
    const components = parentPath
      .slice(root.length)
      .split(sep)
      .filter(Boolean);
    let traversed = root;
    for (const component of components) {
      assertSafeName(component);
      try {
        const nextDescriptor = openAnchoredName(
          descriptor,
          component,
          constants.O_RDONLY |
            constants.O_DIRECTORY |
            constants.O_NOFOLLOW,
        );
        closeSync(descriptor);
        descriptor = nextDescriptor;
      } catch (error) {
        if (!createMissing || errorCode(error) !== "ENOENT") throw error;
        mkdirSync(anchoredName(descriptor, component), { mode: 0o700 });
        const nextDescriptor = openAnchoredName(
          descriptor,
          component,
          constants.O_RDONLY |
            constants.O_DIRECTORY |
            constants.O_NOFOLLOW,
        );
        closeSync(descriptor);
        descriptor = nextDescriptor;
      }
      traversed = resolve(traversed, component);
      assertSecureDirectory(
        fstatSync(descriptor, { bigint: true }),
        traversed,
      );
    }
    return Object.freeze({
      descriptor,
      path: parentPath,
      leafName,
      stamp: fileStamp(fstatSync(descriptor, { bigint: true })),
    });
  } catch (error) {
    closeSync(descriptor);
    if (isSecureFilesystemError(error)) throw error;
    if (errorCode(error) === "ELOOP" || errorCode(error) === "ENOTDIR") {
      fail("path contains a symbolic link or non-directory ancestor");
    }
    throw error;
  }
};

const assertTrustedParentStillNamed = (trustedParent: TrustedParent): void => {
  const probe = openTrustedParent(
    resolve(trustedParent.path, trustedParent.leafName),
    false,
  );
  try {
    if (!sameFileIdentity(trustedParent.stamp, probe.stamp)) {
      fail("parent directory changed after validation");
    }
  } finally {
    closeSync(probe.descriptor);
  }
};

const assertAnchoredLeafStillNamed = (
  trustedParent: TrustedParent,
  expected: FileStamp,
  label: string,
): void => {
  let descriptor: number | undefined;
  try {
    descriptor = openAnchoredLeaf(
      trustedParent,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const current = assertSecureRegularFile(
      fstatSync(descriptor, { bigint: true }),
      label,
    );
    if (!sameFileState(expected, current)) {
      fail(`${label} changed while it was read`);
    }
  } catch (error) {
    if (isSecureFilesystemError(error)) throw error;
    fail(`${label} changed while it was read`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

const assertSecureDirectory = (
  stat: BigIntStats,
  path: string,
): void => {
  if (!stat.isDirectory()) fail("ancestor is not a directory");
  const effectiveUserId = BigInt(requiredEffectiveUserId());
  if (stat.uid !== 0n && stat.uid !== effectiveUserId) {
    fail(`directory owner is unsafe: ${path}`);
  }
  const mode = stat.mode & 0o7777n;
  const isRootOwnedStickyDirectory =
    stat.uid === 0n &&
    (mode & 0o1000n) !== 0n &&
    (mode & 0o002n) !== 0n;
  if ((mode & 0o022n) !== 0n && !isRootOwnedStickyDirectory) {
    fail(`directory permissions are unsafe: ${path}`);
  }
};

const assertSecureRegularFile = (
  stat: BigIntStats,
  label: string,
): FileStamp => {
  if (!stat.isFile()) fail(`${label} must be a regular non-symlink file`);
  if (stat.uid !== BigInt(requiredEffectiveUserId())) {
    fail(`${label} owner must match the effective user`);
  }
  if ((stat.mode & 0o7777n) !== 0o400n) {
    fail(`${label} permissions must be exactly 0400`);
  }
  return fileStamp(stat);
};

const openAnchoredLeaf = (
  trustedParent: TrustedParent,
  flags: number,
  mode?: number,
): number =>
  openAnchoredName(
    trustedParent.descriptor,
    trustedParent.leafName,
    flags,
    mode,
  );

const openAnchoredName = (
  parentDescriptor: number,
  name: string,
  flags: number,
  mode?: number,
): number => {
  assertSafeName(name);
  return mode === undefined
    ? openSync(anchoredName(parentDescriptor, name), flags)
    : openSync(anchoredName(parentDescriptor, name), flags, mode);
};

const anchoredName = (parentDescriptor: number, name: string): string =>
  `${procDescriptorRoot}/${parentDescriptor}/${name}`;

const unlinkAnchoredIfSameFile = (
  trustedParent: TrustedParent,
  expected: FileStamp,
): void => {
  let descriptor: number | undefined;
  try {
    descriptor = openAnchoredLeaf(
      trustedParent,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const current = fileStamp(fstatSync(descriptor, { bigint: true }));
    if (!sameFileIdentity(expected, current)) return;
    closeSync(descriptor);
    descriptor = undefined;
    unlinkSync(anchoredName(trustedParent.descriptor, trustedParent.leafName));
  } catch (error) {
    if (
      errorCode(error) !== "ENOENT" &&
      errorCode(error) !== "ELOOP"
    ) {
      throw error;
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

const exactAbsolutePath = (path: string): string => {
  if (!isAbsolute(path) || resolve(path) !== path) {
    fail("path must be absolute and normalized");
  }
  return path;
};

const assertSafeName = (name: string): void => {
  if (
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    name.includes(sep) ||
    name.includes("\0")
  ) {
    fail("path entry name is malformed");
  }
};

const assertLinuxDescriptorFilesystem = (): void => {
  if (process.platform !== "linux") {
    fail("requires Linux descriptor-anchored filesystem semantics");
  }
};

const requiredEffectiveUserId = (): number => {
  const effectiveUserId = process.geteuid?.();
  if (effectiveUserId === undefined) fail("cannot determine effective user");
  return effectiveUserId;
};

const fileStamp = (stat: BigIntStats): FileStamp =>
  Object.freeze({
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode,
    owner: stat.uid,
    size: stat.size,
    modifiedNanoseconds: stat.mtimeNs,
    changedNanoseconds: stat.ctimeNs,
  });

const sameFileIdentity = (left: FileStamp, right: FileStamp): boolean =>
  left.device === right.device && left.inode === right.inode;

const sameFileState = (left: FileStamp, right: FileStamp): boolean =>
  sameFileIdentity(left, right) &&
  left.mode === right.mode &&
  left.owner === right.owner &&
  left.size === right.size &&
  left.modifiedNanoseconds === right.modifiedNanoseconds &&
  left.changedNanoseconds === right.changedNanoseconds;

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string"
    ? error.code
    : undefined;

const isSecureFilesystemError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.startsWith("Recovery evidence secure filesystem ");

function fail(reason: string): never {
  throw new Error(`Recovery evidence secure filesystem ${reason}`);
}
