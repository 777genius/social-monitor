import {
  PostgresCanonicalRecoveryAmbiguityRetryAuthorizer,
  canonicalRecoveryAmbiguityRetryDate,
} from "./lib/reader-summary-daily-canonical-recovery-v4";
import type {
  CanonicalRecoveryAmbiguityRetryAuthorizationInput,
} from "./lib/reader-summary-daily-canonical-recovery-v4";
import { createReaderSummaryDailyTerminalRuntimeConnection } from "./lib/reader-summary-daily-terminal-runtime-connection";
import { deriveReaderSummaryDailyTerminalDatabaseUrl } from "./run-reader-summary-daily-canonical-recovery";

const tenantId = "00000000-0000-7000-8000-000000000901";
const workspaceId = "00000000-0000-7000-8000-000000000902";

/** The CLI treats an exact database replay as a successful acknowledged retry. */
export const runCanonicalRecoveryAmbiguityRetryAuthorizationCli = async (
  input: Readonly<{
    authorizer: Pick<PostgresCanonicalRecoveryAmbiguityRetryAuthorizer, "authorize">;
    authorizationInput: CanonicalRecoveryAmbiguityRetryAuthorizationInput;
    write: (line: string) => void;
  }>,
): Promise<void> => {
  const authorization = await input.authorizer.authorize(input.authorizationInput);
  input.write(
    `reader-summary-daily-canonical-recovery-v4 ambiguity_retry_authorized date=${input.authorizationInput.requestedUtcDate} model_job_identity=${authorization.modelJobIdentity} authorization_sha256=${authorization.authorizationSha256}`,
  );
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  const systemDatabaseUrl = requiredSystemDatabaseUrl();
  assertScope("READER_SUMMARY_DAILY_TENANT_ID", tenantId);
  assertScope("READER_SUMMARY_DAILY_WORKSPACE_ID", workspaceId);
  const connection = createReaderSummaryDailyTerminalRuntimeConnection({
    READER_SUMMARY_DAILY_TERMINAL_DATABASE_URL:
      deriveReaderSummaryDailyTerminalDatabaseUrl(systemDatabaseUrl),
    READER_SUMMARY_DAILY_AUDITOR_DATABASE_URL: systemDatabaseUrl,
  });
  try {
    await runCanonicalRecoveryAmbiguityRetryAuthorizationCli({
      authorizer: new PostgresCanonicalRecoveryAmbiguityRetryAuthorizer(
        connection.terminal,
      ),
      authorizationInput: {
        tenantId,
        workspaceId,
        requestedUtcDate: canonicalRecoveryAmbiguityRetryDate,
        originalModelJobIdentity: required(
          "READER_SUMMARY_DAILY_AMBIGUITY_ORIGINAL_MODEL_JOB_IDENTITY",
        ),
        sourceAuthoritySha256: required(
          "READER_SUMMARY_DAILY_AMBIGUITY_SOURCE_AUTHORITY_SHA256",
        ),
        authorizedAt: new Date().toISOString(),
      },
      write: console.log,
    });
  } finally {
    await connection.close();
  }
}

const requiredSystemDatabaseUrl = (): string => {
  const value = required("SYSTEM_DATABASE_URL");
  const parsed = new URL(value);
  if (
    !/^postgres(?:ql)?:$/u.test(parsed.protocol) ||
    decodeURIComponent(parsed.username) !== "social_monitor_system_app" ||
    parsed.password.length === 0
  ) {
    throw new Error("SYSTEM_DATABASE_URL must use the production system login");
  }
  return value;
};

const assertScope = (name: string, expected: string): void => {
  if (required(name) !== expected) {
    throw new Error(`${name} is outside the one authorized ambiguity retry scope`);
  }
};

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
};
