import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

import {
  canonicalizeReaderSummaryWeeklyJson,
  type ReaderSummaryWeeklyCanonicalJson,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";

export type ReaderSummaryWeeklyArtifactPairPaths = Readonly<{
  outputDirectory: string;
  artifactPath: string;
  proofPath: string;
  pendingPairPath: string;
  replayCanaryPath: string;
}>;

export type ReaderSummaryWeeklyArtifactPairValidation = Readonly<{
  artifactSha256: string;
  proofSha256: string;
}>;

export type ReaderSummaryWeeklyArtifactPairValidator = (
  artifact: unknown,
  proof: unknown,
  validation: ReaderSummaryWeeklyArtifactPairValidation,
) => void;

export type ReaderSummaryWeeklyArtifactPairState =
  | Readonly<{ status: "missing" }>
  | Readonly<{
      status: "valid";
      artifactPath: string;
      proofPath: string;
      artifactSha256: string;
      proofSha256: string;
    }>;

export const readerSummaryWeeklyArtifactPairInterruptionPoints = [
  "output_directory_create_started",
  "output_directory_created",
  "output_parent_directory_entry_synced",
  "artifact_temp_written",
  "artifact_temp_synced",
  "proof_temp_written",
  "proof_temp_synced",
  "seal_temp_written",
  "seal_temp_synced",
  "staging_directory_synced",
  "pending_publish_started",
  "pending_pair_published",
  "pending_directory_entry_synced",
  "artifact_publish_started",
  "artifact_published",
  "artifact_directory_entry_synced",
  "proof_publish_started",
  "proof_published",
  "proof_directory_entry_synced",
  "pair_validated",
  "pending_remove_started",
  "pending_cleanup_tombstone_published",
  "pending_cleanup_parent_synced",
  "pending_cleanup_remove_started",
  "pending_pair_removed",
  "cleanup_directory_entry_synced",
] as const;

export type ReaderSummaryWeeklyArtifactPairInterruptionPoint =
  (typeof readerSummaryWeeklyArtifactPairInterruptionPoints)[number];

type PairCheckpoint = (
  point: ReaderSummaryWeeklyArtifactPairInterruptionPoint,
) => void;

type CanonicalDocument = Readonly<{
  value: unknown;
  canonical: ReaderSummaryWeeklyCanonicalJson;
}>;

type PendingPair = Readonly<{
  artifact: CanonicalDocument;
  proof: CanonicalDocument;
}>;

const pendingArtifactName = "artifact.json";
const pendingProofName = "proof.json";
const pendingSealName = "pair-seal.json";
const pairSealSchemaVersion =
  "reader_summary.weekly_production_artifact_pair_seal.v1";

export const readerSummaryWeeklyArtifactPairPaths = (
  outputDirectory: string,
  weekStartedOn: string,
): ReaderSummaryWeeklyArtifactPairPaths => {
  const prefix = `reader-summary-weekly-production.${weekStartedOn}`;
  return Object.freeze({
    outputDirectory,
    artifactPath: join(outputDirectory, `${prefix}.artifact.v1.json`),
    proofPath: join(outputDirectory, `${prefix}.proof.v1.json`),
    pendingPairPath: join(outputDirectory, `.${prefix}.pair.v1.pending`),
    replayCanaryPath: join(
      outputDirectory,
      `${prefix}.replay-canary.v1.json`,
    ),
  });
};

export const inspectOrRecoverReaderSummaryWeeklyArtifactPair = (params: {
  paths: ReaderSummaryWeeklyArtifactPairPaths;
  validate: ReaderSummaryWeeklyArtifactPairValidator;
  checkpoint?: PairCheckpoint;
}): ReaderSummaryWeeklyArtifactPairState => {
  const checkpoint = params.checkpoint ?? (() => undefined);
  if (existsSync(params.paths.outputDirectory)) {
    syncDirectory(dirname(params.paths.outputDirectory));
    syncDirectory(params.paths.outputDirectory);
    recoverCleanupTombstones(params.paths);
  }
  const artifactExists = existsSync(params.paths.artifactPath);
  const proofExists = existsSync(params.paths.proofPath);
  const pendingExists = existsSync(params.paths.pendingPairPath);

  if (artifactExists && proofExists) {
    const valid = validatePublishedPair(params.paths, params.validate);
    if (pendingExists) {
      const pending = readPendingPair(params.paths);
      assertPublishedBytesMatchPending(params.paths, pending);
      removePendingPair(params.paths, checkpoint);
    }
    return valid;
  }
  if (!pendingExists) {
    if (!artifactExists && !proofExists) {
      return { status: "missing" };
    }
    const present = artifactExists ? "artifact" : "proof";
    throw new Error(
      `Reader summary weekly legacy artifact/proof pair is incomplete: ${present} exists without a recoverable pair seal`,
    );
  }

  const pending = readPendingPair(params.paths);
  validateDocuments(pending, params.validate);
  publishPendingPair(params.paths, pending, params.validate, checkpoint);
  return validatePublishedPair(params.paths, params.validate);
};

export const inspectReaderSummaryWeeklyArtifactPairReadOnly = (params: {
  paths: ReaderSummaryWeeklyArtifactPairPaths;
  validate: ReaderSummaryWeeklyArtifactPairValidator;
}): ReaderSummaryWeeklyArtifactPairState => {
  const artifactExists = existsSync(params.paths.artifactPath);
  const proofExists = existsSync(params.paths.proofPath);
  if (existsSync(params.paths.pendingPairPath)) {
    throw new Error(
      "Reader summary weekly replay found pending mutable artifact state",
    );
  }
  if (!artifactExists && !proofExists) {
    return { status: "missing" };
  }
  if (!artifactExists || !proofExists) {
    throw new Error(
      "Reader summary weekly replay found an incomplete artifact/proof pair",
    );
  }
  return validatePublishedPair(params.paths, params.validate);
};

export const commitReaderSummaryWeeklyArtifactPair = (params: {
  paths: ReaderSummaryWeeklyArtifactPairPaths;
  artifact: unknown;
  proof: unknown;
  validate: ReaderSummaryWeeklyArtifactPairValidator;
  checkpoint?: PairCheckpoint;
}): boolean => {
  const checkpoint = params.checkpoint ?? (() => undefined);
  ensureOutputDirectory(params.paths.outputDirectory, checkpoint);
  const existing = inspectOrRecoverReaderSummaryWeeklyArtifactPair({
    ...params,
    checkpoint,
  });
  if (existing.status === "valid") {
    const requested = canonicalPair(params.artifact, params.proof);
    assertPublishedBytesMatchPending(params.paths, requested);
    return false;
  }

  const pair = canonicalPair(params.artifact, params.proof);
  validateDocuments(pair, params.validate);
  const stagingPath = join(
    params.paths.outputDirectory,
    `.${basename(params.paths.artifactPath)}.${randomUUID()}.pair.tmp`,
  );
  let pendingPublished = false;
  try {
    mkdirSync(stagingPath, { mode: 0o700 });
    writeCanonicalFile(
      join(stagingPath, pendingArtifactName),
      pair.artifact.canonical,
      () => checkpoint("artifact_temp_written"),
      () => checkpoint("artifact_temp_synced"),
    );
    writeCanonicalFile(
      join(stagingPath, pendingProofName),
      pair.proof.canonical,
      () => checkpoint("proof_temp_written"),
      () => checkpoint("proof_temp_synced"),
    );
    const seal = pairSeal(params.paths, pair);
    writeCanonicalFile(
      join(stagingPath, pendingSealName),
      seal,
      () => checkpoint("seal_temp_written"),
      () => checkpoint("seal_temp_synced"),
    );
    syncDirectory(stagingPath);
    checkpoint("staging_directory_synced");
    checkpoint("pending_publish_started");
    renameSync(stagingPath, params.paths.pendingPairPath);
    pendingPublished = true;
    checkpoint("pending_pair_published");
    syncDirectory(params.paths.outputDirectory);
    checkpoint("pending_directory_entry_synced");
    publishPendingPair(params.paths, pair, params.validate, checkpoint);
    return true;
  } finally {
    rmSync(stagingPath, { recursive: true, force: true });
    if (!pendingPublished) {
      syncDirectory(params.paths.outputDirectory);
    }
  }
};

const publishPendingPair = (
  paths: ReaderSummaryWeeklyArtifactPairPaths,
  pair: PendingPair,
  validate: ReaderSummaryWeeklyArtifactPairValidator,
  checkpoint: PairCheckpoint,
): void => {
  const createdPaths: string[] = [];
  let committed = false;
  try {
    checkpoint("artifact_publish_started");
    publishExactFile(
      join(paths.pendingPairPath, pendingArtifactName),
      paths.artifactPath,
      pair.artifact.canonical,
      createdPaths,
    );
    checkpoint("artifact_published");
    syncDirectory(paths.outputDirectory);
    checkpoint("artifact_directory_entry_synced");
    checkpoint("proof_publish_started");
    publishExactFile(
      join(paths.pendingPairPath, pendingProofName),
      paths.proofPath,
      pair.proof.canonical,
      createdPaths,
    );
    checkpoint("proof_published");
    syncDirectory(paths.outputDirectory);
    checkpoint("proof_directory_entry_synced");
    validatePublishedPair(paths, validate);
    committed = true;
    checkpoint("pair_validated");
    removePendingPair(paths, checkpoint);
  } catch (error) {
    if (!committed) {
      for (const path of createdPaths.reverse()) {
        rmSync(path, { force: true });
      }
      syncDirectory(paths.outputDirectory);
    }
    throw error;
  }
};

const publishExactFile = (
  sourcePath: string,
  destinationPath: string,
  expected: ReaderSummaryWeeklyCanonicalJson,
  createdPaths: string[],
): void => {
  try {
    linkSync(sourcePath, destinationPath);
    createdPaths.push(destinationPath);
  } catch (error) {
    if (!isAlreadyExists(error)) {
      throw error;
    }
    assertExactCanonicalFile(destinationPath, expected);
  }
};

const validatePublishedPair = (
  paths: ReaderSummaryWeeklyArtifactPairPaths,
  validate: ReaderSummaryWeeklyArtifactPairValidator,
): Extract<ReaderSummaryWeeklyArtifactPairState, { status: "valid" }> => {
  const artifact = readCanonicalFile(
    paths.artifactPath,
    "published weekly production artifact",
    true,
  );
  const proof = readCanonicalFile(
    paths.proofPath,
    "published weekly production proof",
    true,
  );
  validateDocuments({ artifact, proof }, validate);
  return Object.freeze({
    status: "valid",
    artifactPath: paths.artifactPath,
    proofPath: paths.proofPath,
    artifactSha256: artifact.canonical.sha256,
    proofSha256: proof.canonical.sha256,
  });
};

const validateDocuments = (
  pair: PendingPair,
  validate: ReaderSummaryWeeklyArtifactPairValidator,
): void =>
  validate(pair.artifact.value, pair.proof.value, {
    artifactSha256: pair.artifact.canonical.sha256,
    proofSha256: pair.proof.canonical.sha256,
  });

const canonicalPair = (artifact: unknown, proof: unknown): PendingPair =>
  Object.freeze({
    artifact: Object.freeze({
      value: artifact,
      canonical: canonicalizeReaderSummaryWeeklyJson(
        artifact,
        "production artifact canonical bytes",
      ),
    }),
    proof: Object.freeze({
      value: proof,
      canonical: canonicalizeReaderSummaryWeeklyJson(
        proof,
        "production proof canonical bytes",
      ),
    }),
  });

const readPendingPair = (
  paths: ReaderSummaryWeeklyArtifactPairPaths,
): PendingPair => {
  const artifact = readCanonicalFile(
    join(paths.pendingPairPath, pendingArtifactName),
    "pending weekly production artifact",
  );
  const proof = readCanonicalFile(
    join(paths.pendingPairPath, pendingProofName),
    "pending weekly production proof",
  );
  const seal = readCanonicalFile(
    join(paths.pendingPairPath, pendingSealName),
    "pending weekly production pair seal",
  ).value as Record<string, unknown>;
  const expectedSeal = pairSeal(paths, { artifact, proof });
  const expectedPairSha256 = (
    JSON.parse(expectedSeal.json) as { pairSha256: string }
  ).pairSha256;
  const actualSealBytes = readFileSync(
    join(paths.pendingPairPath, pendingSealName),
  );
  if (
    seal.pairSha256 !== expectedPairSha256 ||
    !actualSealBytes.equals(Buffer.from(expectedSeal.toBytes()))
  ) {
    throw new Error("Reader summary weekly pending artifact pair seal is invalid");
  }
  return Object.freeze({ artifact, proof });
};

const pairSeal = (
  paths: ReaderSummaryWeeklyArtifactPairPaths,
  pair: PendingPair,
): ReaderSummaryWeeklyCanonicalJson => {
  const body = Object.freeze({
    schemaVersion: pairSealSchemaVersion,
    artifactName: basename(paths.artifactPath),
    artifactSha256: pair.artifact.canonical.sha256,
    artifactByteLength: pair.artifact.canonical.byteLength,
    proofName: basename(paths.proofPath),
    proofSha256: pair.proof.canonical.sha256,
    proofByteLength: pair.proof.canonical.byteLength,
  });
  const pairSha256 = canonicalizeReaderSummaryWeeklyJson(
    body,
    "production artifact pair seal body",
  ).sha256;
  return canonicalizeReaderSummaryWeeklyJson(
    Object.freeze({ ...body, pairSha256 }),
    "production artifact pair seal",
  );
};

const assertPublishedBytesMatchPending = (
  paths: ReaderSummaryWeeklyArtifactPairPaths,
  pair: PendingPair,
): void => {
  assertExactCanonicalFile(paths.artifactPath, pair.artifact.canonical);
  assertExactCanonicalFile(paths.proofPath, pair.proof.canonical);
};

const readCanonicalFile = (
  path: string,
  label: string,
  allowLegacyPrettyBytes = false,
): CanonicalDocument => {
  const bytes = readFileSync(path);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new Error(`Reader summary weekly ${label} is not valid JSON`);
  }
  const canonical = canonicalizeReaderSummaryWeeklyJson(value, label);
  const isCanonical = bytes.equals(Buffer.from(canonical.toBytes()));
  const isExactLegacyPretty =
    allowLegacyPrettyBytes &&
    bytes.equals(Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
  if (!isCanonical && !isExactLegacyPretty) {
    throw new Error(`Reader summary weekly ${label} is not exact canonical bytes`);
  }
  return Object.freeze({ value, canonical });
};

const assertExactCanonicalFile = (
  path: string,
  expected: ReaderSummaryWeeklyCanonicalJson,
): void => {
  const actual = readFileSync(path);
  if (
    actual.byteLength !== expected.byteLength ||
    !actual.equals(Buffer.from(expected.toBytes()))
  ) {
    throw new Error(
      `Reader summary weekly artifact pair refuses to overwrite divergent data at ${path}`,
    );
  }
};

const writeCanonicalFile = (
  path: string,
  canonical: ReaderSummaryWeeklyCanonicalJson,
  afterWrite: () => void,
  afterSync: () => void,
): void => {
  const descriptor = openSync(path, "wx", 0o444);
  try {
    writeFileSync(descriptor, canonical.toBytes());
    afterWrite();
    fsyncSync(descriptor);
    afterSync();
  } finally {
    closeSync(descriptor);
  }
};

const syncDirectory = (path: string): void => {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY,
  );
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

const ensureOutputDirectory = (
  outputDirectory: string,
  checkpoint: PairCheckpoint,
): void => {
  if (!existsSync(outputDirectory)) {
    checkpoint("output_directory_create_started");
    mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
    checkpoint("output_directory_created");
    syncDirectory(dirname(outputDirectory));
    checkpoint("output_parent_directory_entry_synced");
  } else {
    syncDirectory(dirname(outputDirectory));
  }
  syncDirectory(outputDirectory);
};

const removePendingPair = (
  paths: ReaderSummaryWeeklyArtifactPairPaths,
  checkpoint: PairCheckpoint,
): void => {
  const tombstonePath = cleanupTombstonePath(paths);
  checkpoint("pending_remove_started");
  renameSync(paths.pendingPairPath, tombstonePath);
  checkpoint("pending_cleanup_tombstone_published");
  syncDirectory(paths.outputDirectory);
  checkpoint("pending_cleanup_parent_synced");
  checkpoint("pending_cleanup_remove_started");
  rmSync(tombstonePath, { recursive: true, force: true });
  checkpoint("pending_pair_removed");
  syncDirectory(paths.outputDirectory);
  checkpoint("cleanup_directory_entry_synced");
};

const recoverCleanupTombstones = (
  paths: ReaderSummaryWeeklyArtifactPairPaths,
): void => {
  const tombstones = readdirSync(paths.outputDirectory)
    .filter((name) => isCleanupTombstoneName(paths, name))
    .sort();
  for (const name of tombstones) {
    rmSync(join(paths.outputDirectory, name), { recursive: true, force: true });
    syncDirectory(paths.outputDirectory);
  }
};

const cleanupTombstonePath = (
  paths: ReaderSummaryWeeklyArtifactPairPaths,
): string =>
  join(
    paths.outputDirectory,
    `${basename(paths.pendingPairPath)}.${randomUUID()}.cleanup`,
  );

const isCleanupTombstoneName = (
  paths: ReaderSummaryWeeklyArtifactPairPaths,
  name: string,
): boolean => {
  const prefix = `${basename(paths.pendingPairPath)}.`;
  const attemptId = name.slice(prefix.length, -".cleanup".length);
  return (
    name.startsWith(prefix) &&
    name.endsWith(".cleanup") &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      attemptId,
    )
  );
};

const isAlreadyExists = (
  error: unknown,
): error is NodeJS.ErrnoException =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as NodeJS.ErrnoException).code === "EEXIST";
