import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  formatDailyScanTerminalPreimageArtifact,
  formatDailyScanTerminalRepairArtifact,
  printRepairReceipt,
  writeDurableExact,
} from "./reader-summary-daily-canonical-recovery-v4-scan-terminal-repair-cli";

import {
  assertDailyScanTerminalRepairReceipt,
  captureDailyScanTerminalRepairPreimage,
  captureDailyScanTerminalRepairPreimageForReview,
  dailyScanTerminalRepairConfirmation,
  dailyScanTerminalRepairRuntimeRole,
  dailyScanTerminalRepairScope,
  dailyScanTerminalRepairTargets,
  reconcileDailyScanTerminalRepairReceipt,
  repairDailyScanTerminals,
  type DailyScanTerminalRepairSqlClient,
  type DailyScanTerminalRepairReceipt,
} from "./reader-summary-daily-canonical-recovery-v4-scan-terminal-repair";

describe("daily scan terminal repair C1", () => {
  it("pins the reviewed production identities and runtime authority", () => {
    expect(dailyScanTerminalRepairConfirmation).toBe(
      "reader-summary-daily-scan-terminal-repair-c1",
    );
    expect(dailyScanTerminalRepairRuntimeRole).toBe(
      "social_monitor_system_app",
    );
    expect(dailyScanTerminalRepairTargets).toEqual({
      hackerNews: {
        jobId: "e630ed7d-42b7-4bf0-a747-f9bdf0f8a9d7",
        sourceBindingId: "0348ff97-3925-4d04-a192-7e782badbf50",
        leaseId: "703fd7b5-cf83-4508-a5b1-5a9dfdc4643e",
      },
      reddit: {
        jobId: "b9de1ac8-4490-48d6-befa-a25472b5e94a",
        sourceBindingId: "8e753ea9-fb03-4c05-8288-6e871cb20b27",
        failureReasonSha256:
          "f6080204874629cf05223f8dc7650330a89106f0e4562a92b4b5310bd9f90ad1",
      },
    });
  });

  it("keeps the fixture target seam internal to SQL and out of CLI artifacts", async () => {
    const targetContract = {
      hackerNews: {
        jobId: "00000000-0000-7000-8000-000000009101",
        sourceBindingId: "00000000-0000-7000-8000-000000009102",
        leaseId: "00000000-0000-7000-8000-000000009103",
      },
      reddit: {
        jobId: "00000000-0000-7000-8000-000000009104",
        sourceBindingId: "00000000-0000-7000-8000-000000009105",
        failureReasonSha256: createHash("sha256")
          .update("synthetic fixture failure", "utf8")
          .digest("hex"),
      },
    };
    const values: (readonly unknown[])[] = [];
    const client: DailyScanTerminalRepairSqlClient = {
      query: async <TRow extends Record<string, unknown>>(
        _sql: string,
        queryValues = [],
      ) => {
        values.push(queryValues);
        return { rows: [], rowCount: 0 } as Readonly<{
          rows: readonly TRow[];
          rowCount: number;
        }>;
      },
    };
    await expect(
      captureDailyScanTerminalRepairPreimage(client, { targetContract }),
    ).rejects.toThrow("requires exactly two target rows");
    expect(values[0]?.slice(0, 4)).toEqual([
      targetContract.hackerNews.jobId,
      targetContract.hackerNews.sourceBindingId,
      targetContract.reddit.jobId,
      targetContract.reddit.sourceBindingId,
    ]);
    const cliSource = readFileSync(
      require.resolve("./reader-summary-daily-canonical-recovery-v4-scan-terminal-repair-cli"),
      "utf8",
    );
    expect(cliSource).not.toContain("targetContract");
  });

  it("rolls back before writes when the recaptured preimage is not exact", async () => {
    const queries: string[] = [];
    const persistReceiptBeforeCommit = jest.fn();
    const discardPreparedReceipt = jest.fn();
    const client: DailyScanTerminalRepairSqlClient = {
      query: async <TRow extends Record<string, unknown>>(sql: string) => {
        queries.push(sql);
        if (sql.includes("SELECT session_user")) {
          return result<TRow>({
            session_user: "social_monitor_system_app",
            current_user: "social_monitor_system_app",
            tenant_id: "00000000-0000-7000-8000-000000000901",
            workspace_id: "00000000-0000-7000-8000-000000000902",
            system_access: "true",
            transaction_isolation: "serializable",
            transaction_read_only: "off",
          });
        }
        return { rows: [], rowCount: 0 };
      },
    };
    await expect(
      repairDailyScanTerminals({
        client,
        reviewedPreimageSha256: "a".repeat(64),
        persistReceiptBeforeCommit,
        discardPreparedReceipt,
      }),
    ).rejects.toThrow("requires exactly two target rows");
    expect(queries[0]).toContain(
      "BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE",
    );
    expect(queries[1]).toContain("set_config('social_monitor.tenant_id'");
    expect(queries.at(-1)).toBe("ROLLBACK");
    expect(queries.some((sql) => /^\s*UPDATE public\./u.test(sql))).toBe(false);
    expect(persistReceiptBeforeCommit).not.toHaveBeenCalled();
    expect(discardPreparedReceipt).toHaveBeenCalledTimes(1);
  });

  it("captures the reviewed preimage inside exact read-only RLS authority", async () => {
    const queries: string[] = [];
    const client: DailyScanTerminalRepairSqlClient = {
      query: async <TRow extends Record<string, unknown>>(sql: string) => {
        queries.push(sql);
        if (sql.includes("SELECT session_user")) {
          return result<TRow>({
            session_user: "social_monitor_system_app",
            current_user: "social_monitor_system_app",
            tenant_id: "00000000-0000-7000-8000-000000000901",
            workspace_id: "00000000-0000-7000-8000-000000000902",
            system_access: "true",
            transaction_isolation: "serializable",
            transaction_read_only: "on",
          });
        }
        if (sql.includes("to_jsonb(transaction_timestamp())")) {
          return result<TRow>({ now: "2026-08-11T12:00:00.000Z" });
        }
        return { rows: [], rowCount: 0 };
      },
    };
    await expect(
      captureDailyScanTerminalRepairPreimageForReview(client),
    ).rejects.toThrow("requires exactly two target rows");
    expect(queries[0]).toContain(
      "BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY",
    );
    expect(queries[1]).toContain("social_monitor.workspace_id");
    expect(queries[3]).toContain(
      "(to_jsonb(transaction_timestamp()) #>> '{}') AS now",
    );
    expect(queries[4]).toContain(
      "WITH target(job_id, binding_id, tenant_id, workspace_id, target)",
    );
    expect(queries.at(-1)).toBe("ROLLBACK");
  });

  it("fails closed before mutation when identical target IDs resolve outside the frozen scope", async () => {
    const calls: { sql: string; values: readonly unknown[] }[] = [];
    const client: DailyScanTerminalRepairSqlClient = {
      query: async <TRow extends Record<string, unknown>>(
        sql: string,
        values = [],
      ) => {
        calls.push({ sql, values });
        if (sql.includes("SELECT session_user")) {
          return result<TRow>({
            session_user: dailyScanTerminalRepairRuntimeRole,
            current_user: dailyScanTerminalRepairRuntimeRole,
            tenant_id: dailyScanTerminalRepairScope.tenantId,
            workspace_id: dailyScanTerminalRepairScope.workspaceId,
            system_access: "true",
            transaction_isolation: "serializable",
            transaction_read_only: "off",
          });
        }
        if (sql.includes("WITH target(job_id")) {
          return {
            rows: wrongScopeCapturedTargets() as readonly TRow[],
            rowCount: 2,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    await expect(
      repairDailyScanTerminals({
        client,
        reviewedPreimageSha256: "a".repeat(64),
        persistReceiptBeforeCommit: jest.fn(),
        discardPreparedReceipt: jest.fn(),
      }),
    ).rejects.toThrow("job scope drifted");

    const capture = calls.find(({ sql }) => sql.includes("WITH target(job_id"));
    expect(capture?.values).toEqual([
      dailyScanTerminalRepairTargets.hackerNews.jobId,
      dailyScanTerminalRepairTargets.hackerNews.sourceBindingId,
      dailyScanTerminalRepairTargets.reddit.jobId,
      dailyScanTerminalRepairTargets.reddit.sourceBindingId,
      dailyScanTerminalRepairScope.tenantId,
      dailyScanTerminalRepairScope.workspaceId,
    ]);
    expect(
      calls.some(({ sql }) => /\b(?:UPDATE|DELETE)\s+public\./u.test(sql)),
    ).toBe(false);
    expect(calls.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("scopes every capture relation and every terminal CAS predicate", async () => {
    const queries: Readonly<{ sql: string; values: readonly unknown[] }>[] = [];
    const client: DailyScanTerminalRepairSqlClient = {
      query: async (sql: string, values = []) => {
        (queries as { sql: string; values: readonly unknown[] }[]).push({
          sql,
          values,
        });
        return { rows: [], rowCount: 0 };
      },
    };
    await expect(
      captureDailyScanTerminalRepairPreimage(client),
    ).rejects.toThrow("requires exactly two target rows");
    const capture = queries[0]!;
    expect(capture.sql).toContain(
      "target(job_id, binding_id, tenant_id, workspace_id, target)",
    );
    for (const relation of [
      "job",
      "attempt",
      "binding",
      "policy",
      "lease",
      "decision",
    ]) {
      expect(capture.sql).toContain(
        `${relation}.tenant_id=target.tenant_id AND ${relation}.workspace_id=target.workspace_id`,
      );
    }
    for (const relation of ["q", "c", "r", "o", "i", "f", "k"]) {
      expect(capture.sql).toContain(`${relation}.tenant_id=target.tenant_id`);
    }
    expect(capture.sql).toContain("c.workspace_id=target.workspace_id");
    expect(capture.sql).toContain("r.workspace_id=target.workspace_id");
    expect(capture.sql).toContain("o.workspace_id=target.workspace_id");
    expect(capture.sql).toContain("i.workspace_id=target.workspace_id");
    expect(capture.sql).toContain("f.workspace_id=target.workspace_id");
    expect(capture.sql).toContain("k.workspace_id=target.workspace_id");
    expect(capture.values.slice(-2)).toEqual([
      dailyScanTerminalRepairScope.tenantId,
      dailyScanTerminalRepairScope.workspaceId,
    ]);

    const source = readFileSync(
      require.resolve("./reader-summary-daily-canonical-recovery-v4-scan-terminal-repair"),
      "utf8",
    );
    for (const scopedRelation of [
      "job.tenant_id=target.tenant_id AND job.workspace_id=target.workspace_id",
      "attempt.tenant_id=target.tenant_id AND attempt.workspace_id=target.workspace_id",
      "binding.tenant_id=target.tenant_id AND binding.workspace_id=target.workspace_id",
      "policy.tenant_id=target.tenant_id AND policy.workspace_id=target.workspace_id",
      "lease.tenant_id=target.tenant_id AND lease.workspace_id=target.workspace_id",
      "decision.tenant_id=target.tenant_id AND decision.workspace_id=target.workspace_id",
    ]) {
      expect(source.split(scopedRelation)).toHaveLength(3);
    }
    expect(
      source.split(") target(job_id,binding_id,tenant_id,workspace_id,target)"),
    ).toHaveLength(2);
    expect(source).toContain(
      "AND tenant_id=$4::UUID AND workspace_id=$5::UUID",
    );
    expect(source).toContain(
      "AND tenant_id=$3::UUID AND workspace_id=$4::UUID",
    );
    expect(source).toContain(
      "AND job.tenant_id=$5::UUID AND job.workspace_id=$6::UUID",
    );
    expect(source).toContain(
      "AND attempt.tenant_id=$5::UUID AND attempt.workspace_id=$6::UUID",
    );
  });

  it("durably prepares restore evidence before the database commit", () => {
    const source = readFileSync(
      require.resolve("./reader-summary-daily-canonical-recovery-v4-scan-terminal-repair"),
      "utf8",
    );
    expect(
      source.indexOf("params.persistReceiptBeforeCommit(receipt)"),
    ).toBeLessThan(source.indexOf('params.client.query("COMMIT")'));
    expect(source).toContain("reconcileDailyScanTerminalRepairReceipt");
    expect(source).toContain('"committed" | "not_committed"');
  });

  it("uses the same JSON timestamp representation as row readback", () => {
    const source = readFileSync(
      require.resolve("./reader-summary-daily-canonical-recovery-v4-scan-terminal-repair"),
      "utf8",
    );
    expect(
      source.split("(to_jsonb(transaction_timestamp()) #>> '{}') AS now"),
    ).toHaveLength(3);
    expect(source).not.toContain("transaction_timestamp()::TEXT");
  });

  it("formats the workflow repair artifact without private target evidence", () => {
    const artifact = formatDailyScanTerminalRepairArtifact(fixtureReceipt());
    expect(JSON.parse(artifact)).toEqual({
      schemaVersion: "reader_summary.daily_scan_terminal_repair.c1",
      confirmation: dailyScanTerminalRepairConfirmation,
      reviewedPreimageSha256: "a".repeat(64),
      transactionTimestamp: "2026-08-11T12:00:00.000Z",
      targetCount: 2,
      restoreEvidenceSha256: fixtureReceipt().restoreEvidenceSha256,
      durableReceipt: true,
    });
    expect(artifact).not.toContain("targets");
    expect(artifact).not.toContain("before");
    expect(artifact).not.toContain("after");
    expect(artifact).not.toContain(
      dailyScanTerminalRepairTargets.hackerNews.jobId,
    );
  });

  it("formats a digest-bound exact redacted preimage projection", () => {
    const formatted = formatDailyScanTerminalPreimageArtifact(
      fixtureCapturedPreimage(),
    );
    const artifact = JSON.parse(formatted) as Record<string, unknown>;
    expect(Object.keys(artifact)).toEqual([
      "schemaVersion",
      "confirmation",
      "capturedAt",
      "reviewedPreimageSha256",
      "targetCount",
      "redactedTargetsSha256",
      "targets",
    ]);
    expect(artifact.targetCount).toBe(2);
    expect(artifact.redactedTargetsSha256).toBe(
      createHash("sha256")
        .update(JSON.stringify(artifact.targets), "utf8")
        .digest("hex"),
    );
    expect(formatted).not.toMatch(
      /snapshot|before|after|config|metadata|idempotencyKey|correlationId|workerId|fencingToken/u,
    );
  });

  it("publishes a complete receipt atomically and accepts only exact races", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-scan-repair-receipt-"));
    const path = join(directory, "receipt.json");
    const receipt = fixtureReceipt();
    const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`, "utf8");
    try {
      expect(writeDurableExact(path, receipt)).toBe(true);
      expect(readFileSync(path)).toEqual(bytes);
      expect(statSync(path).mode & 0o777).toBe(0o400);
      expect(readdirSync(directory)).toEqual(["receipt.json"]);

      expect(writeDurableExact(path, receipt)).toBe(false);
      expect(readdirSync(directory)).toEqual(["receipt.json"]);

      rmSync(path);
      writeFileSync(path, Buffer.from("conflicting-receipt\n"), {
        mode: 0o400,
      });
      expect(() => writeDurableExact(path, receipt)).toThrow(
        "Existing daily scan terminal repair receipt conflicts",
      );
      expect(readFileSync(path, "utf8")).toBe("conflicting-receipt\n");
      expect(readdirSync(directory)).toEqual(["receipt.json"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reconciles exact committed and not-committed receipts and rejects drift", async () => {
    const receipt = fixtureReceipt();
    await expect(
      reconcileDailyScanTerminalRepairReceipt(
        reconciliationClient(receipt.targets.map((target) => target.after)),
        receipt,
      ),
    ).resolves.toBe("committed");
    await expect(
      reconcileDailyScanTerminalRepairReceipt(
        reconciliationClient(receipt.targets.map((target) => target.before)),
        receipt,
      ),
    ).resolves.toBe("not_committed");
    const drifted = receipt.targets.map((target) => ({
      ...target.after,
      job: {
        ...(target.after.job as Record<string, unknown>),
        status: "DRIFTED",
      },
    }));
    await expect(
      reconcileDailyScanTerminalRepairReceipt(
        reconciliationClient(drifted),
        receipt,
      ),
    ).rejects.toThrow("receipt does not match DB state");
  });

  it("rejects tampered restore evidence, identity, and schema", () => {
    const receipt = fixtureReceipt();
    expect(() =>
      assertDailyScanTerminalRepairReceipt({
        ...receipt,
        restoreEvidenceSha256: "b".repeat(64),
      }),
    ).toThrow("restore evidence is invalid");
    expect(() =>
      assertDailyScanTerminalRepairReceipt({
        ...receipt,
        targets: receipt.targets.map((target, index) =>
          index === 0 ? { ...target, jobId: "tampered" } : target,
        ),
      }),
    ).toThrow("receipt identity is invalid");
    expect(() =>
      assertDailyScanTerminalRepairReceipt({
        ...receipt,
        schemaVersion: "reader_summary.daily_scan_terminal_repair.c0",
      }),
    ).toThrow("receipt envelope is invalid");
  });

  it("prints only the allowlisted repair receipt summary", () => {
    const receipt = fixtureReceipt();
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      printRepairReceipt(receipt);

      expect(log).toHaveBeenCalledTimes(1);
      const output = String(log.mock.calls[0]?.[0]);
      expect(JSON.parse(output)).toEqual({
        schemaVersion: receipt.schemaVersion,
        confirmation: receipt.confirmation,
        reviewedPreimageSha256: receipt.reviewedPreimageSha256,
        transactionTimestamp: receipt.transactionTimestamp,
        restoreEvidenceSha256: receipt.restoreEvidenceSha256,
        targetCount: 2,
        durableReceipt: true,
      });
      expect(output).not.toContain("sentinel-before-job-id");
      expect(output).not.toContain("sentinel-after-attempt-id");
      expect(output).not.toContain(receipt.targets[0]!.jobId);
      expect(output).not.toContain(receipt.targets[0]!.sourceBindingId);
    } finally {
      log.mockRestore();
    }
  });

  it("orders durable staging before no-overwrite publication", () => {
    const source = readFileSync(
      require.resolve("./reader-summary-daily-canonical-recovery-v4-scan-terminal-repair-cli"),
      "utf8",
    );
    expect(source.indexOf("writeFileSync(descriptor, bytes)")).toBeLessThan(
      source.indexOf("fsyncSync(descriptor)"),
    );
    expect(source.indexOf("fsyncSync(descriptor)")).toBeLessThan(
      source.indexOf("closeSync(descriptor)"),
    );
    expect(source.indexOf("closeSync(descriptor)")).toBeLessThan(
      source.indexOf("linkSync(stagingPath, path)"),
    );
    expect(source).not.toContain('openSync(path, "wx"');
  });
});

const result = <TRow extends Record<string, unknown>>(
  row: Record<string, unknown>,
): Readonly<{ rows: readonly TRow[]; rowCount: number }> => ({
  rows: [row as TRow],
  rowCount: 1,
});

const wrongScopeCapturedTargets = (): readonly Record<string, unknown>[] => {
  const wrongTenantId = "00000000-0000-7000-8000-000000009901";
  const wrongWorkspaceId = "00000000-0000-7000-8000-000000009902";
  const snapshot = (
    target: "hacker_news" | "reddit",
  ): Record<string, unknown> => {
    const bindingId =
      target === "hacker_news"
        ? dailyScanTerminalRepairTargets.hackerNews.sourceBindingId
        : dailyScanTerminalRepairTargets.reddit.sourceBindingId;
    const policyId = `00000000-0000-7000-8000-000000000${
      target === "hacker_news" ? "911" : "912"
    }`;
    const sourceId = `00000000-0000-7000-8000-000000000${
      target === "hacker_news" ? "921" : "922"
    }`;
    const scope = {
      tenant_id: wrongTenantId,
      workspace_id: wrongWorkspaceId,
    };
    return {
      job: {
        ...scope,
        retry_count: 0,
        source_binding_id: bindingId,
        scan_policy_id: policyId,
        status: target === "hacker_news" ? "ENQUEUED" : "REQUESTED",
      },
      attempt: {
        ...scope,
        source_binding_id: bindingId,
        status: target === "hacker_news" ? "RUNNING" : "FAILED",
        attempt_number: 1,
        fetched: 0,
        inserted: 0,
        skipped_duplicates: 0,
        projected: 0,
        failure_reason:
          target === "hacker_news"
            ? null
            : "the digest is intentionally never reached",
        finished_at: target === "hacker_news" ? null : "2026-08-11T00:00:00Z",
      },
      lease:
        target === "hacker_news"
          ? {
              ...scope,
              id: dailyScanTerminalRepairTargets.hackerNews.leaseId,
            }
          : null,
      binding: {
        ...scope,
        id: bindingId,
        source_catalog_entry_id: sourceId,
      },
      source: {
        id: sourceId,
        provider_key: target === "hacker_news" ? "hacker-news" : "reddit",
      },
      policy: { ...scope, id: policyId, source_binding_id: bindingId },
      schedulerDecisions: [{}],
      downstream: {
        failureQueue: 0,
        githubCandidates: 0,
        githubResults: 0,
        engagementObservations: 0,
        sourceItems: 0,
        feedItems: 0,
        outbox: 0,
        inbox: 0,
        idempotency: 0,
        cursor: 0,
      },
    };
  };
  return [
    { target: "hacker_news", snapshot: snapshot("hacker_news") },
    { target: "reddit", snapshot: snapshot("reddit") },
  ];
};

const fixtureReceipt = (): DailyScanTerminalRepairReceipt => {
  const targets = [
    {
      target: "hacker_news" as const,
      jobId: dailyScanTerminalRepairTargets.hackerNews.jobId,
      sourceBindingId:
        dailyScanTerminalRepairTargets.hackerNews.sourceBindingId,
      before: fixtureReceiptSnapshot("hacker_news", "before"),
      after: fixtureReceiptSnapshot("hacker_news", "after"),
    },
    {
      target: "reddit" as const,
      jobId: dailyScanTerminalRepairTargets.reddit.jobId,
      sourceBindingId: dailyScanTerminalRepairTargets.reddit.sourceBindingId,
      before: fixtureReceiptSnapshot("reddit", "before"),
      after: fixtureReceiptSnapshot("reddit", "after"),
    },
  ];
  return {
    schemaVersion: "reader_summary.daily_scan_terminal_repair.c1",
    confirmation: dailyScanTerminalRepairConfirmation,
    reviewedPreimageSha256: "a".repeat(64),
    transactionTimestamp: "2026-08-11T12:00:00.000Z",
    targets,
    restoreEvidenceSha256: fixtureDigest(
      targets.map((target) => ({
        target: target.target,
        job: target.before.job,
        attempt: target.before.attempt,
        lease: target.before.lease,
      })),
    ),
  };
};

const fixtureReceiptSnapshot = (
  target: "hacker_news" | "reddit",
  side: "before" | "after",
): Record<string, unknown> => {
  const scope = {
    tenant_id: dailyScanTerminalRepairScope.tenantId,
    workspace_id: dailyScanTerminalRepairScope.workspaceId,
  };
  return {
    job: {
      ...scope,
      id: side === "before" ? "sentinel-before-job-id" : `${target}-job`,
      status: side === "before" ? "REQUESTED" : "FAILED",
    },
    attempt: {
      ...scope,
      id: side === "after" ? "sentinel-after-attempt-id" : `${target}-attempt`,
      status: side === "before" ? "RUNNING" : "FAILED",
    },
    lease:
      target === "hacker_news" && side === "before"
        ? { ...scope, id: dailyScanTerminalRepairTargets.hackerNews.leaseId }
        : null,
    binding: { ...scope, id: `${target}-binding` },
    source: { id: `${target}-source`, privatePayload: "sentinel-after-source" },
    policy: { ...scope, id: `${target}-policy` },
    schedulerDecisions: [{ ...scope, id: `${target}-decision` }],
    failureMetadataSqlNull: true,
    executionMetadataSqlNull: true,
    ...(side === "before"
      ? {
          downstream: { sourceItems: 0 },
          metadata: { privatePayload: "sentinel-before-metadata" },
        }
      : {}),
  };
};

const reconciliationClient = (
  snapshots: readonly Record<string, unknown>[],
): DailyScanTerminalRepairSqlClient => ({
  query: async <TRow extends Record<string, unknown>>(sql: string) => {
    if (sql.includes("SELECT session_user")) {
      return result<TRow>({
        session_user: dailyScanTerminalRepairRuntimeRole,
        current_user: dailyScanTerminalRepairRuntimeRole,
        tenant_id: dailyScanTerminalRepairScope.tenantId,
        workspace_id: dailyScanTerminalRepairScope.workspaceId,
        system_access: "true",
        transaction_isolation: "serializable",
        transaction_read_only: "on",
      });
    }
    if (sql.includes("WITH target")) {
      return {
        rows: [
          { target: "hacker_news", snapshot: snapshots[0] },
          { target: "reddit", snapshot: snapshots[1] },
        ] as unknown as readonly TRow[],
        rowCount: 2,
      };
    }
    return { rows: [], rowCount: 0 };
  },
});

const fixtureDigest = (value: unknown): string =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item) =>
        item !== null && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(
              Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
            )
          : item,
      ),
      "utf8",
    )
    .digest("hex");

const fixtureCapturedPreimage = () => ({
  capturedAt: "2026-08-11T12:00:00.000Z",
  sha256: "a".repeat(64),
  targets: [
    {
      target: "hacker_news" as const,
      snapshot: fixturePrivateSnapshot({
        jobStatus: "ENQUEUED",
        attemptStatus: "RUNNING",
        failureReason: null,
        lease: { worker_id: "private-worker", fencing_token: "private-token" },
      }),
    },
    {
      target: "reddit" as const,
      snapshot: fixturePrivateSnapshot({
        jobStatus: "REQUESTED",
        attemptStatus: "FAILED",
        failureReason: "private provider failure",
        lease: null,
      }),
    },
  ],
});

const fixturePrivateSnapshot = (input: {
  readonly jobStatus: string;
  readonly attemptStatus: string;
  readonly failureReason: string | null;
  readonly lease: Record<string, unknown> | null;
}): Record<string, unknown> => ({
  job: { status: input.jobStatus, provider_config: "private" },
  attempt: {
    status: input.attemptStatus,
    attempt_number: 1,
    fetched: 0,
    inserted: 0,
    skipped_duplicates: 0,
    projected: 0,
    failure_reason: input.failureReason,
  },
  lease: input.lease,
  schedulerDecisions: [{ correlation_id: "private" }],
  downstream: {
    failureQueue: "0",
    githubCandidates: "0",
    githubResults: "0",
    engagementObservations: "0",
    sourceItems: "0",
    feedItems: "0",
    outbox: "0",
    inbox: "0",
    idempotency: "0",
    cursor: "0",
  },
  failureMetadataSqlNull: true,
  executionMetadataSqlNull: true,
});
