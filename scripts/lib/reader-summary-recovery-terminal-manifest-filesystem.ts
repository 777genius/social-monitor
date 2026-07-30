import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  readSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, parse, resolve, sep } from "node:path";
import type { BigIntStats } from "node:fs";

export const recoveryTerminalFilesystemCheckpoints = [
  "source_opened",
  "trusted_parent_opened",
  "temporary_file_synced",
  "before_publish",
  "output_published",
] as const;

export type RecoveryTerminalFilesystemCheckpoint =
  (typeof recoveryTerminalFilesystemCheckpoints)[number];

export type RecoveryTerminalFilesystemCheckpointHandler = (
  checkpoint: RecoveryTerminalFilesystemCheckpoint,
) => void;

export type RecoveryTerminalImmutableSource = Readonly<{
  path: string;
  sha256: string;
  assertUnchanged(): void;
  close(): void;
}>;

export type RecoveryTerminalFilesystemPublishResult<TManifest> = Readonly<{
  outcome: "created" | "replayed";
  bytes: Buffer;
  manifest: TManifest;
}>;

type FileStamp = Readonly<{
  device: bigint;
  inode: bigint;
  mode: bigint;
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
const sha256Pattern = /^[0-9a-f]{64}$/u;

export const openRecoveryTerminalImmutableSource = (params: {
  readonly path: string;
  readonly expectedSha256: string;
  readonly checkpoint?: RecoveryTerminalFilesystemCheckpointHandler;
}): RecoveryTerminalImmutableSource => {
  const expectedSha256 = exactSha256(params.expectedSha256);
  const trustedParent = openTrustedParent(params.path);
  let sourceDescriptor: number | undefined;
  let closed = false;
  try {
    sourceDescriptor = openAnchoredLeaf(
      trustedParent,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const sourceStamp = regularFileStamp(
      sourceDescriptor,
      "source dump is not a regular file",
    );
    const sourceSha256 = stableDescriptorSha256(
      sourceDescriptor,
      sourceStamp,
      "source dump changed while it was verified",
    );
    if (sourceSha256 !== expectedSha256) {
      fail("source dump identity diverged");
    }
    params.checkpoint?.("source_opened");

    const descriptor = sourceDescriptor;
    sourceDescriptor = undefined;
    return Object.freeze({
      path: resolveExactAbsolutePath(params.path),
      sha256: sourceSha256,
      assertUnchanged: (): void => {
        if (closed) {
          fail("source dump handle is already closed");
        }
        assertTrustedParentStillNamed(trustedParent);
        const currentDescriptor = openAnchoredLeaf(
          trustedParent,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          const currentStamp = regularFileStamp(
            currentDescriptor,
            "source dump is not a regular file",
          );
          if (
            !sameFileIdentity(sourceStamp, currentStamp) ||
            !sameFileState(sourceStamp, currentStamp)
          ) {
            fail("source dump changed after verification");
          }
          const currentSha256 = stableDescriptorSha256(
            currentDescriptor,
            currentStamp,
            "source dump changed after verification",
          );
          if (currentSha256 !== expectedSha256) {
            fail("source dump changed after verification");
          }
        } finally {
          closeSync(currentDescriptor);
        }
      },
      close: (): void => {
        if (closed) {
          return;
        }
        closed = true;
        closeSync(descriptor);
        closeSync(trustedParent.descriptor);
      },
    });
  } catch (error) {
    if (sourceDescriptor !== undefined) {
      closeSync(sourceDescriptor);
    }
    closeSync(trustedParent.descriptor);
    throw error;
  }
};

export const publishRecoveryTerminalImmutableManifest = <TManifest>(params: {
  readonly outputPath: string;
  readonly bytes: Buffer;
  readonly manifest: TManifest;
  readonly parseAndValidate: (bytes: Buffer) => TManifest;
  readonly checkpoint?: RecoveryTerminalFilesystemCheckpointHandler;
}): RecoveryTerminalFilesystemPublishResult<TManifest> => {
  const trustedParent = openTrustedParent(params.outputPath);
  let temporaryDescriptor: number | undefined;
  const temporaryName =
    `.${trustedParent.leafName}.${process.pid}.${randomUUID()}.tmp`;
  try {
    params.checkpoint?.("trusted_parent_opened");
    assertTrustedParentStillNamed(trustedParent);
    const existing = readExistingImmutableManifest({
      trustedParent,
      expectedBytes: params.bytes,
      parseAndValidate: params.parseAndValidate,
    });
    if (existing !== undefined) {
      return existing;
    }

    temporaryDescriptor = openAnchoredName(
      trustedParent.descriptor,
      temporaryName,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o400,
    );
    writeFileSync(temporaryDescriptor, params.bytes);
    fchmodSync(temporaryDescriptor, 0o400);
    fsyncSync(temporaryDescriptor);
    closeSync(temporaryDescriptor);
    temporaryDescriptor = undefined;
    params.checkpoint?.("temporary_file_synced");
    assertTrustedParentStillNamed(trustedParent);
    params.checkpoint?.("before_publish");
    assertTrustedParentStillNamed(trustedParent);

    try {
      linkSync(
        anchoredName(trustedParent.descriptor, temporaryName),
        anchoredName(trustedParent.descriptor, trustedParent.leafName),
      );
    } catch (error) {
      if (errorCode(error) !== "EEXIST") {
        fail("output publication failed");
      }
      const concurrent = readExistingImmutableManifest({
        trustedParent,
        expectedBytes: params.bytes,
        parseAndValidate: params.parseAndValidate,
      });
      if (concurrent === undefined) {
        fail("concurrent output disappeared");
      }
      return concurrent;
    }

    fsyncSync(trustedParent.descriptor);
    params.checkpoint?.("output_published");
    assertTrustedParentStillNamed(trustedParent);
    const published = readExistingImmutableManifest({
      trustedParent,
      expectedBytes: params.bytes,
      parseAndValidate: params.parseAndValidate,
    });
    if (published === undefined) {
      fail("published output disappeared");
    }
    return Object.freeze({
      outcome: "created",
      bytes: published.bytes,
      manifest: params.manifest,
    });
  } finally {
    if (temporaryDescriptor !== undefined) {
      closeSync(temporaryDescriptor);
    }
    unlinkAnchoredIfPresent(trustedParent.descriptor, temporaryName);
    closeSync(trustedParent.descriptor);
  }
};

const readExistingImmutableManifest = <TManifest>(params: {
  readonly trustedParent: TrustedParent;
  readonly expectedBytes: Buffer;
  readonly parseAndValidate: (bytes: Buffer) => TManifest;
}): RecoveryTerminalFilesystemPublishResult<TManifest> | undefined => {
  let descriptor: number | undefined;
  try {
    descriptor = openAnchoredLeaf(
      params.trustedParent,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return undefined;
    }
    fail("existing output cannot be opened safely");
  }
  try {
    const stamp = regularFileStamp(
      descriptor,
      "existing output is not a regular file",
    );
    if ((stamp.mode & 0o222n) !== 0n) {
      fail("existing output is not immutable");
    }
    const before = stamp;
    const bytes = readFileSync(descriptor);
    const after = fileStamp(descriptor);
    if (!sameFileState(before, after)) {
      fail("existing output changed while it was verified");
    }
    const manifest = params.parseAndValidate(bytes);
    if (!bytes.equals(params.expectedBytes)) {
      fail("refuses divergent replay or concurrent clobber");
    }
    return Object.freeze({
      outcome: "replayed",
      bytes,
      manifest,
    });
  } finally {
    closeSync(descriptor);
  }
};

const openTrustedParent = (path: string): TrustedParent => {
  const absolute = resolveExactAbsolutePath(path);
  const parentPath = dirname(absolute);
  const leafName = basename(absolute);
  if (leafName.length === 0 || leafName === "." || leafName === "..") {
    fail("filesystem leaf name is malformed");
  }
  const root = parse(absolute).root;
  let descriptor = openSync(
    root,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const relativeParent = parentPath.slice(root.length);
    const components = relativeParent.split(sep).filter(Boolean);
    for (const component of components) {
      if (component === "." || component === "..") {
        fail("filesystem path is not normalized");
      }
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
    const stamp = directoryStamp(descriptor);
    return Object.freeze({
      descriptor,
      path: parentPath,
      leafName,
      stamp,
    });
  } catch (error) {
    closeSync(descriptor);
    if (isRecoveryTerminalFilesystemError(error)) {
      throw error;
    }
    fail("filesystem path contains an unsafe or missing ancestor");
  }
};

const assertTrustedParentStillNamed = (trustedParent: TrustedParent): void => {
  const probe = openTrustedParent(
    resolve(trustedParent.path, trustedParent.leafName),
  );
  try {
    if (!sameFileIdentity(trustedParent.stamp, probe.stamp)) {
      fail("filesystem parent changed after it was trusted");
    }
  } finally {
    closeSync(probe.descriptor);
  }
};

const resolveExactAbsolutePath = (path: string): string => {
  if (!isAbsolute(path) || resolve(path) !== path) {
    fail("filesystem path must be absolute and normalized");
  }
  return path;
};

const openAnchoredLeaf = (
  trustedParent: TrustedParent,
  flags: number,
): number =>
  openAnchoredName(
    trustedParent.descriptor,
    trustedParent.leafName,
    flags,
  );

const openAnchoredName = (
  parentDescriptor: number,
  name: string,
  flags: number,
  mode?: number,
): number => {
  if (
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\0")
  ) {
    fail("filesystem entry name is malformed");
  }
  try {
    return mode === undefined
      ? openSync(anchoredName(parentDescriptor, name), flags)
      : openSync(anchoredName(parentDescriptor, name), flags, mode);
  } catch (error) {
    if (
      errorCode(error) === "ELOOP" ||
      errorCode(error) === "ENOTDIR"
    ) {
      fail("filesystem path contains a symbolic link");
    }
    throw error;
  }
};

const anchoredName = (parentDescriptor: number, name: string): string =>
  `${procDescriptorRoot}/${parentDescriptor}/${name}`;

const directoryStamp = (descriptor: number): FileStamp => {
  const stat = fstatSync(descriptor, { bigint: true });
  if (!stat.isDirectory()) {
    fail("filesystem ancestor is not a directory");
  }
  return stampFromStat(stat);
};

const regularFileStamp = (
  descriptor: number,
  reason: string,
): FileStamp => {
  const stat = fstatSync(descriptor, { bigint: true });
  if (!stat.isFile()) {
    fail(reason);
  }
  return stampFromStat(stat);
};

const fileStamp = (descriptor: number): FileStamp =>
  stampFromStat(fstatSync(descriptor, { bigint: true }));

const stampFromStat = (
  stat: BigIntStats,
): FileStamp =>
  Object.freeze({
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode,
    size: stat.size,
    modifiedNanoseconds: stat.mtimeNs,
    changedNanoseconds: stat.ctimeNs,
  });

const stableDescriptorSha256 = (
  descriptor: number,
  expectedStamp: FileStamp,
  mutationReason: string,
): string => {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0;
  while (true) {
    const bytesRead = readSync(
      descriptor,
      buffer,
      0,
      buffer.byteLength,
      position,
    );
    if (bytesRead === 0) {
      break;
    }
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  if (!sameFileState(expectedStamp, fileStamp(descriptor))) {
    fail(mutationReason);
  }
  return hash.digest("hex");
};

const sameFileIdentity = (left: FileStamp, right: FileStamp): boolean =>
  left.device === right.device && left.inode === right.inode;

const sameFileState = (left: FileStamp, right: FileStamp): boolean =>
  sameFileIdentity(left, right) &&
  left.mode === right.mode &&
  left.size === right.size &&
  left.modifiedNanoseconds === right.modifiedNanoseconds &&
  left.changedNanoseconds === right.changedNanoseconds;

const unlinkAnchoredIfPresent = (
  parentDescriptor: number,
  name: string,
): void => {
  try {
    unlinkSync(anchoredName(parentDescriptor, name));
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      fail("temporary output cleanup failed");
    }
  }
};

const exactSha256 = (value: string): string => {
  if (!sha256Pattern.test(value)) {
    fail("expected dump hash must be a lowercase SHA-256");
  }
  return value;
};

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string"
    ? error.code
    : undefined;

const isRecoveryTerminalFilesystemError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.startsWith(
    "Reader summary recovery terminal manifest filesystem ",
  );

function fail(reason: string): never {
  throw new Error(
    `Reader summary recovery terminal manifest filesystem ${reason}`,
  );
}
