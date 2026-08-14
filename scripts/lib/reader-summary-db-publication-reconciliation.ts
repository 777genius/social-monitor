import { createHash, randomUUID } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import type { VerifiedReaderSummaryExecutionAttestation } from "@social-monitor/summary/adapters/model/reader-summary-execution-attestation";
import type {
  ReaderSummaryPublicationCommand,
  ReaderSummaryPublicationOutcome,
  ReaderSummaryPublicationPort,
} from "@social-monitor/summary/ports";

const recoveryFormat = "reader-summary-db-publication-recovery-v1";

type RecoveryRecord = Readonly<{
  schemaVersion: 1;
  format: typeof recoveryFormat;
  attemptIdentity: string;
  tenantId: string;
  workspaceId: string;
  periodKey: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  executionAttestations: readonly VerifiedReaderSummaryExecutionAttestation[];
  executionAttestationSetSha256: string;
}>;

export class ReaderSummaryDbPublicationRecoveryStore {
  private readonly directory: string;
  private readonly attemptIdentity: string;

  constructor(directory: string, attemptIdentity: string) {
    this.directory = resolve(requiredText(directory, "directory"));
    requiredSha256(attemptIdentity, "attempt identity");
    this.attemptIdentity = attemptIdentity;
  }

  prepare(
    command: ReaderSummaryPublicationCommand,
    attestations: readonly VerifiedReaderSummaryExecutionAttestation[],
  ): void {
    const artifact = command.artifact.toSnapshot();
    const job = command.finalJob.toSnapshot();
    const record: RecoveryRecord = Object.freeze({
      schemaVersion: 1,
      format: recoveryFormat,
      attemptIdentity: this.attemptIdentity,
      tenantId: artifact.tenantId,
      workspaceId: artifact.workspaceId,
      periodKey: artifact.period.periodKey,
      readerSummaryJobId: job.id,
      readerSummaryArtifactId: artifact.readerSummaryId,
      executionAttestations: cloneAttestations(attestations),
      executionAttestationSetSha256: canonicalJsonSha256(attestations),
    });
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    installImmutable(
      this.path(artifact.readerSummaryId),
      Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8"),
    );
  }

  load(input: {
    tenantId: string;
    workspaceId: string;
    periodKey: string;
    readerSummaryJobId: string;
    readerSummaryArtifactId: string;
  }): readonly VerifiedReaderSummaryExecutionAttestation[] {
    const bytes = readFileSync(this.path(input.readerSummaryArtifactId));
    const value = parseRecord(bytes);
    const attestations = value.executionAttestations;
    if (
      value.schemaVersion !== 1 ||
      value.format !== recoveryFormat ||
      value.attemptIdentity !== this.attemptIdentity ||
      value.tenantId !== input.tenantId ||
      value.workspaceId !== input.workspaceId ||
      value.periodKey !== input.periodKey ||
      value.readerSummaryJobId !== input.readerSummaryJobId ||
      value.readerSummaryArtifactId !== input.readerSummaryArtifactId ||
      !Array.isArray(attestations) ||
      value.executionAttestationSetSha256 !==
        canonicalJsonSha256(attestations)
    ) {
      throw new Error(
        "Reader summary DB publication recovery does not match durable identity",
      );
    }
    return cloneAttestations(
      attestations as VerifiedReaderSummaryExecutionAttestation[],
    );
  }

  private path(readerSummaryArtifactId: string): string {
    if (!/^[0-9a-f-]{36}$/iu.test(readerSummaryArtifactId)) {
      throw new Error("Reader summary recovery artifact identity is invalid");
    }
    return join(
      this.directory,
      `${this.attemptIdentity}.${readerSummaryArtifactId}.v1.json`,
    );
  }
}

export class RecoverableReaderSummaryPublication
  implements ReaderSummaryPublicationPort
{
  private readonly delegate: ReaderSummaryPublicationPort;
  private readonly recovery: ReaderSummaryDbPublicationRecoveryStore;
  private readonly attestations: () =>
    readonly VerifiedReaderSummaryExecutionAttestation[];

  constructor(
    delegate: ReaderSummaryPublicationPort,
    recovery: ReaderSummaryDbPublicationRecoveryStore,
    attestations: () =>
      readonly VerifiedReaderSummaryExecutionAttestation[],
  ) {
    this.delegate = delegate;
    this.recovery = recovery;
    this.attestations = attestations;
  }

  async publish(
    command: ReaderSummaryPublicationCommand,
  ): Promise<ReaderSummaryPublicationOutcome> {
    this.recovery.prepare(command, this.attestations());
    return this.delegate.publish(command);
  }
}

export const createRecoverableReaderSummaryPublication = (input: {
  delegate: ReaderSummaryPublicationPort;
  recoveryDirectory: string | undefined;
  attemptIdentity: string;
  attestations: () => readonly VerifiedReaderSummaryExecutionAttestation[];
}): Readonly<{
  publication: ReaderSummaryPublicationPort;
  recovery: ReaderSummaryDbPublicationRecoveryStore | null;
}> => {
  if (input.recoveryDirectory === undefined) {
    return Object.freeze({ publication: input.delegate, recovery: null });
  }
  const recovery = new ReaderSummaryDbPublicationRecoveryStore(
    input.recoveryDirectory,
    input.attemptIdentity,
  );
  return Object.freeze({
    recovery,
    publication: new RecoverableReaderSummaryPublication(
      input.delegate,
      recovery,
      input.attestations,
    ),
  });
};

export const assertReaderSummaryDbPublicationFailpointInactive = (
  value: string | undefined,
): void => {
  if (value === "after-db-before-state") {
    throw new Error("failpoint: after DB publication before terminal state");
  }
};

const installImmutable = (path: string, bytes: Buffer): void => {
  const temporary = `${path}.next-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
    try {
      linkSync(temporary, path);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
  } finally {
    rmSync(temporary, { force: true });
  }
  const persisted = readFileSync(path);
  if (!persisted.equals(bytes) || sha256(persisted) !== sha256(bytes)) {
    throw new Error("Reader summary DB publication recovery is immutable");
  }
};

const parseRecord = (bytes: Buffer): Record<string, unknown> => {
  try {
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Use the stable redacted error below.
  }
  throw new Error("Reader summary DB publication recovery is invalid");
};

const cloneAttestations = (
  values: readonly VerifiedReaderSummaryExecutionAttestation[],
): readonly VerifiedReaderSummaryExecutionAttestation[] =>
  values.map((value) => ({
    taskRole: value.taskRole,
    attempt: value.attempt,
    normalizedOutputSha256: value.normalizedOutputSha256,
    attestation: { ...value.attestation },
  }));

const requiredText = (value: string, label: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Reader summary recovery ${label} is required`);
  }
  return normalized;
};

const requiredSha256 = (value: string, label: string): string => {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`Reader summary recovery ${label} is invalid`);
  }
  return value;
};

const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

const canonicalJsonSha256 = (value: unknown): string =>
  sha256(Buffer.from(JSON.stringify(canonicalJsonValue(value)), "utf8"));

const canonicalJsonValue = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJsonValue(item)]),
  );
};

const hasCode = (error: unknown, code: string): boolean =>
  typeof error === "object" && error !== null && "code" in error &&
  error.code === code;
