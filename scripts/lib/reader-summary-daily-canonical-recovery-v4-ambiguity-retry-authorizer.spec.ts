import { spawnSync } from "node:child_process";
import { join } from "node:path";

import type {
  ReaderSummaryDailySqlClient,
  ReaderSummaryDailySqlTransaction,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor-row";

import {
  PostgresCanonicalRecoveryAmbiguityRetryAuthorizer,
  canonicalRecoveryAmbiguityRetryDate,
} from "./reader-summary-daily-canonical-recovery-v4";
import {
  runCanonicalRecoveryAmbiguityRetryAuthorizationCli,
} from "../authorize-reader-summary-daily-canonical-recovery-v4-ambiguity-retry";

describe("reader summary daily canonical recovery v4 ambiguity retry authorizer", () => {
  it("maps only the bound attempt-2 identity from a serializable authorization", async () => {
    const query = jest.fn(async () => ({
      rows: [{
        model_job_identity: "b".repeat(64),
        authorization_sha256: "c".repeat(64),
      }],
      rowCount: 1,
    }));
    const transaction = { query } as unknown as ReaderSummaryDailySqlTransaction;
    const client: ReaderSummaryDailySqlClient = {
      query: async () => {
        throw new Error("authorization must use a serializable transaction");
      },
      serializable: async (operation) => operation(transaction),
    };

    await expect(new PostgresCanonicalRecoveryAmbiguityRetryAuthorizer(client)
      .authorize({
        tenantId: "00000000-0000-7000-8000-000000000901",
        workspaceId: "00000000-0000-7000-8000-000000000902",
        requestedUtcDate: canonicalRecoveryAmbiguityRetryDate,
        originalModelJobIdentity: "a".repeat(64),
        sourceAuthoritySha256: "d".repeat(64),
        authorizedAt: "2026-08-04T00:00:00.000Z",
      })).resolves.toEqual({
      modelJobIdentity: "b".repeat(64),
      authorizationSha256: "c".repeat(64),
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry"),
      expect.arrayContaining([canonicalRecoveryAmbiguityRetryDate]),
    );
  });

  it("rejects any date outside the one reviewed ambiguity exception", async () => {
    const client = { serializable: jest.fn() } as unknown as ConstructorParameters<
      typeof PostgresCanonicalRecoveryAmbiguityRetryAuthorizer
    >[0];

    await expect(new PostgresCanonicalRecoveryAmbiguityRetryAuthorizer(client)
      .authorize({
        tenantId: "00000000-0000-7000-8000-000000000901",
        workspaceId: "00000000-0000-7000-8000-000000000902",
        requestedUtcDate: "2026-07-24",
        originalModelJobIdentity: "a".repeat(64),
        sourceAuthoritySha256: "d".repeat(64),
        authorizedAt: "2026-08-04T00:00:00.000Z",
      })).rejects.toThrow(/not authorized/u);
    expect(client.serializable).not.toHaveBeenCalled();
  });

  it("reports a reconnect replay as a successful CLI authorization", async () => {
    const write = jest.fn();
    const authorize = jest.fn(async () => ({
      modelJobIdentity: "b".repeat(64),
      authorizationSha256: "c".repeat(64),
    }));

    await expect(runCanonicalRecoveryAmbiguityRetryAuthorizationCli({
      authorizer: { authorize } as Pick<
        PostgresCanonicalRecoveryAmbiguityRetryAuthorizer,
        "authorize"
      >,
      authorizationInput: {
        tenantId: "00000000-0000-7000-8000-000000000901",
        workspaceId: "00000000-0000-7000-8000-000000000902",
        requestedUtcDate: canonicalRecoveryAmbiguityRetryDate,
        originalModelJobIdentity: "a".repeat(64),
        sourceAuthoritySha256: "d".repeat(64),
        authorizedAt: "2026-08-04T00:00:01.000Z",
      },
      write,
    })).resolves.toBeUndefined();

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining("ambiguity_retry_authorized date=2026-07-23"),
    );
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it("starts directly before attempting database setup when the system URL is absent", () => {
    const child = spawnSync(
      process.execPath,
      [
        "-r",
        "ts-node/register/transpile-only",
        "-r",
        "tsconfig-paths/register",
        "scripts/authorize-reader-summary-daily-canonical-recovery-v4-ambiguity-retry.ts",
      ],
      {
        cwd: join(__dirname, "../.."),
        encoding: "utf8",
        env: {
          ...process.env,
          SYSTEM_DATABASE_URL: "",
          TS_NODE_COMPILER_OPTIONS: JSON.stringify({ rootDir: "." }),
        },
      },
    );

    if (child.error !== undefined) {
      throw child.error;
    }

    expect(child.status).toBe(1);
    expect(child.signal).toBeNull();
    expect(child.stderr).toBe("SYSTEM_DATABASE_URL is required\n");
  });
});
