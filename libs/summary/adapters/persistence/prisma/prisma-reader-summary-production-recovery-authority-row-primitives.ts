import {
  canonicalizeReaderSummaryWeeklyJson,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryProductionRecoveryTenantId,
  readerSummaryProductionRecoveryWorkspaceId,
  readerSummaryProductionRecoveryRequestedUtcDates,
} from "../../../ports/reader-summary-production-recovery-authority.port";

export const assertProductionRecoveryScope = (
  tenantId: string,
  workspaceId: string,
): void => {
  if (
    tenantId !== readerSummaryProductionRecoveryTenantId ||
    workspaceId !== readerSummaryProductionRecoveryWorkspaceId
  ) {
    failProductionRecovery("tenant/workspace authority diverged");
  }
};

export const canonicalProductionRecoveryTimestamp = (
  input: unknown,
  label: string,
): string => {
  if (!(input instanceof Date) || !Number.isFinite(input.getTime())) {
    failProductionRecovery(`${label} is invalid`);
  }
  return new Date((input as Date).getTime()).toISOString();
};

export const productionRecoveryIdentity = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
}): Readonly<{
  identity: string;
  recoveryId: string;
}> => {
  const identitySha256 = canonicalizeReaderSummaryWeeklyJson({
    schemaVersion: "reader_summary.production_recovery_identity.v2",
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    requestedUtcDates: readerSummaryProductionRecoveryRequestedUtcDates,
  }).sha256;
  return {
    identity: `reader_summary.production_recovery.v2:${identitySha256}`,
    recoveryId: recoveryUuid(identitySha256),
  };
};

export const exactRecoveryRecord = (
  input: unknown,
  label: string,
): Readonly<Record<string, unknown>> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    failProductionRecovery(`${label} is invalid`);
  }
  return input as Readonly<Record<string, unknown>>;
};

export const exactRecoveryIdentity = (
  input: unknown,
  label: string,
): string => {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > 4_096 ||
    input !== input.trim()
  ) {
    failProductionRecovery(`${label} is invalid`);
  }
  return input as string;
};

export const exactRecoveryText = (
  input: unknown,
  label: string,
): string => {
  if (typeof input !== "string" || input.length > 1_000_000) {
    failProductionRecovery(`${label} is invalid`);
  }
  return input as string;
};

export const exactRecoveryUuid = (
  input: unknown,
  label: string,
): string => {
  const value = exactRecoveryIdentity(input, label);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      value,
    )
  ) {
    failProductionRecovery(`${label} is invalid`);
  }
  return value;
};

export const recoveryUuid = (sha256: string): string =>
  `${sha256.slice(0, 8)}-${sha256.slice(8, 12)}-5${sha256.slice(13, 16)}-8${sha256.slice(17, 20)}-${sha256.slice(20, 32)}`;

export const exactRecoverySha256 = (
  input: unknown,
  label: string,
): string => {
  if (typeof input !== "string" || !/^[0-9a-f]{64}$/u.test(input)) {
    failProductionRecovery(`${label} is invalid`);
  }
  return input as string;
};

export const exactRecoveryPositiveInteger = (
  input: unknown,
  label: string,
): number => {
  if (!Number.isSafeInteger(input) || Number(input) < 1) {
    failProductionRecovery(`${label} is invalid`);
  }
  return Number(input);
};

export const failProductionRecovery = (reason: string): never => {
  throw new Error(`Reader summary production recovery ${reason}`);
};
