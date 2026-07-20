import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { Pool, type PoolClient } from "pg";

import {
  assertLegacyPublicationUpgrade,
  assertLegacyRepositoryVisibility,
  seedLegacyPublicationUpgradeFixtures,
} from "./reader-summary-publication-postgres-legacy";
import {
  assertPreMigrationArtifactRuntimeContinuity,
  assertPublicationRoleMemberships,
  assertReaderSummaryPublicationPrivilegeBoundary,
  createPublicationFixtureRuntimeRole,
  dropPublicationFixtureDatabaseAndRoles,
  grantLegacyMigrationOwnership,
  grantPublicationFixtureRuntimePrivileges,
  makePublicationFixtureRuntimeDatabaseOwner,
  publicationProtectedRolePresence,
  publicationDatabaseUrl,
  publicationRuntimeDatabaseUrl,
  quotePostgresIdentifier,
  quotePostgresLiteral,
  runReaderSummaryPublicationBootstrapSql,
} from "./reader-summary-publication-postgres-privileges";
import { assertReaderSummaryPublicationRuntimeGuard } from "./reader-summary-publication-postgres-runtime-guard";

const serverAdminDatabaseUrl = requiredEnv(
  "READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL",
);
const fixtureSuffix = randomBytes(10).toString("hex");
const databaseName = `reader_summary_publication_test_${fixtureSuffix}`;
const migrationAdminRole = `social_monitor_publication_admin_${fixtureSuffix}`;
const migrationAdminPassword = randomBytes(24).toString("base64url");
const runtimeRole = `social_monitor_publication_test_${fixtureSuffix}`;
const runtimePassword = randomBytes(24).toString("base64url");
const targetDatabaseUrl = publicationDatabaseUrl(
  serverAdminDatabaseUrl,
  databaseName,
);
const adminDatabaseUrl = publicationRuntimeDatabaseUrl(
  targetDatabaseUrl,
  migrationAdminRole,
  migrationAdminPassword,
);
const runtimeDatabaseUrl = publicationRuntimeDatabaseUrl(
  adminDatabaseUrl,
  runtimeRole,
  runtimePassword,
);
const serverAdmin = new Pool({
  connectionString: serverAdminDatabaseUrl,
  max: 1,
});
const migrationWorkspace = mkdtempSync(
  join(tmpdir(), "reader-summary-publication-migrations-"),
);
const publicationMigration =
  "20260716170000_reader_summary_fail_closed_publication";
let ownerRolePreexisting = false;
let capabilityRolePreexisting = false;
let schemaOwnerRolePreexisting = false;
let fixtureDatabaseCreated = false;
let fixtureMigrationAdminRoleCreated = false;
let fixtureRuntimeRoleCreated = false;

async function main(): Promise<void> {
  assert(
    /^reader_summary_publication_test_[0-9a-f]{20}$/.test(databaseName),
    "temporary publication database name must be bounded",
  );
  const protectedRoles = await publicationProtectedRolePresence(serverAdmin);
  ownerRolePreexisting = protectedRoles.owner;
  capabilityRolePreexisting = protectedRoles.capability;
  schemaOwnerRolePreexisting = protectedRoles.schemaOwner;
  try {
    await serverAdmin.query(
      `CREATE ROLE ${quotePostgresIdentifier(migrationAdminRole)} LOGIN PASSWORD ${quotePostgresLiteral(migrationAdminPassword)}
       NOSUPERUSER NOCREATEDB CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`,
    );
    fixtureMigrationAdminRoleCreated = true;
    await serverAdmin.query(
      `CREATE DATABASE ${quotePostgresIdentifier(databaseName)} OWNER ${quotePostgresIdentifier(migrationAdminRole)}`,
    );
    fixtureDatabaseCreated = true;
    await createPublicationFixtureRuntimeRole({
      databaseName,
      migrationAdminRole,
      runtimePassword,
      runtimeRole,
      serverAdminDatabaseUrl,
    });
    fixtureRuntimeRoleCreated = true;
    await makePublicationFixtureRuntimeDatabaseOwner({
      databaseName,
      migrationAdminRole,
      runtimeRole,
      targetDatabaseUrl,
    });

    preparePrePublicationMigrations();
    await grantLegacyMigrationOwnership(adminDatabaseUrl, runtimeRole);
    applyOrderedMigrations(
      runtimeDatabaseUrl,
      join(migrationWorkspace, "schema.prisma"),
    );
    await seedLegacyPublicationUpgradeFixtures(runtimeDatabaseUrl);
    await assertLegacyTablesOwnedByRuntime(adminDatabaseUrl, runtimeRole);
    await runReaderSummaryPublicationBootstrapSql(
      "pre",
      adminDatabaseUrl,
      runtimeRole,
    );
    await assertPublicationRoleMemberships(
      adminDatabaseUrl,
      migrationAdminRole,
      runtimeRole,
    );
    await assertPreMigrationArtifactRuntimeContinuity(runtimeDatabaseUrl);
    // Recovery after a deploy abort immediately after the committed pre phase.
    await runReaderSummaryPublicationBootstrapSql(
      "pre",
      adminDatabaseUrl,
      runtimeRole,
    );
    await assertPublicationRoleMemberships(
      adminDatabaseUrl,
      migrationAdminRole,
      runtimeRole,
    );
    installPublicationMigration();
    applyOrderedMigrations(
      adminDatabaseUrl,
      join(migrationWorkspace, "schema.prisma"),
    );
    // Recovery after Prisma committed but before the post hardening phase.
    await runReaderSummaryPublicationBootstrapSql(
      "pre",
      adminDatabaseUrl,
      runtimeRole,
    );
    applyOrderedMigrations(
      adminDatabaseUrl,
      join(migrationWorkspace, "schema.prisma"),
    );
    await runReaderSummaryPublicationBootstrapSql(
      "post",
      adminDatabaseUrl,
      runtimeRole,
    );
    await assertPublicationRoleMemberships(
      adminDatabaseUrl,
      migrationAdminRole,
      runtimeRole,
    );
    await runReaderSummaryPublicationBootstrapSql(
      "pre",
      adminDatabaseUrl,
      runtimeRole,
    );
    await runReaderSummaryPublicationBootstrapSql(
      "post",
      adminDatabaseUrl,
      runtimeRole,
    );
    assertMigrationDatabaseMatchesPrismaSchema(targetDatabaseUrl);
    const auditorPool = new Pool({ connectionString: targetDatabaseUrl, max: 1 });
    const admin = new Pool({ connectionString: adminDatabaseUrl, max: 2 });
    const runtime = new Pool({ connectionString: runtimeDatabaseUrl, max: 4 });
    try {
      await grantPublicationFixtureRuntimePrivileges(admin, runtimeRole);
      const auditor = await auditorPool.connect();
      const first = await runtime.connect();
      const second = await runtime.connect();
      try {
        const [firstPid, secondPid] = await Promise.all([
          postgresBackendPid(first),
          postgresBackendPid(second),
        ]);
        assert(
          firstPid !== secondPid,
          "race must use two independent PostgreSQL connections",
        );
        await assertOrderedUpgrade(auditor);
        await assertLegacyPublicationUpgrade(auditor, publicationMigration);
        await assertLegacyRepositoryVisibility(runtimeDatabaseUrl);
        const privilegeFixture = await createRunningFixture(
          first,
          "COMPLETED",
          19,
        );
        assert(
          (await publish(first, privilegeFixture.payload)) === "published",
          "privilege fixture must publish through the definer function",
        );
        const noSignalPrivilegeFixture = await createRunningFixture(
          first,
          "NO_SIGNAL",
          18,
        );
        assert(
          (await publish(first, noSignalPrivilegeFixture.payload)) ===
            "published",
          "NO_SIGNAL privilege fixture must publish through the definer function",
        );
        await assertReaderSummaryPublicationRuntimeGuard({
          runtime: first,
          runtimeDatabaseUrl,
          publishedArtifactId: privilegeFixture.artifactId,
        });
        await assertReaderSummaryPublicationPrivilegeBoundary({
          auditor,
          runtime: first,
          migrationAdminRole,
          runtimeRole,
          artifactIds: [
            noSignalPrivilegeFixture.artifactId,
            privilegeFixture.artifactId,
          ],
          proofSha256: String(privilegeFixture.payload.proofSha256),
        });
        await assertSemanticReplay(first, "COMPLETED", 1);
        await assertSemanticReplay(first, "NO_SIGNAL", 2);
        await assertMissingBindingsFailClosed(first, 3);
        await assertOlderStrongModelFailsClosed(first, 4);
        await assertConcurrentSemanticReplay(first, second, 5);
        await assertExactlyOneRaceWinner(first, second, 6);
      } finally {
        auditor.release();
        first.release();
        second.release();
      }
    } finally {
      await runtime.end();
      await admin.end();
      await auditorPool.end();
    }
  } finally {
    rmSync(migrationWorkspace, { recursive: true, force: true });
    await dropPublicationFixtureDatabaseAndRoles({
      serverAdmin,
      databaseName,
      migrationAdminRole,
      runtimeRole,
      ownerRolePreexisting,
      capabilityRolePreexisting,
      schemaOwnerRolePreexisting,
      fixtureDatabaseCreated,
      fixtureMigrationAdminRoleCreated,
      fixtureRuntimeRoleCreated,
    });
  }

  console.log(
    "Reader summary PostgreSQL privilege, upgrade, replay, and concurrency gate OK",
  );
}

const assertOrderedUpgrade = async (client: PoolClient): Promise<void> => {
  const expected = readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const applied = await client.query<{ readonly migration_name: string }>(
    `SELECT migration_name
       FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY started_at, migration_name`,
  );
  assertDeepEqual(
    applied.rows.map((row) => row.migration_name),
    expected,
    "original baseline and every ordered forward repair must apply",
  );

  const objects = await client.query<{
    readonly publications: string | null;
    readonly slots: string | null;
    readonly publisher: string | null;
  }>(
    `SELECT
       to_regclass('reader_summary_publications')::text AS publications,
       to_regclass('reader_summary_publication_slots')::text AS slots,
       to_regprocedure('publish_reader_summary(jsonb)')::text AS publisher`,
  );
  assert(
    objects.rows[0]?.publications === "reader_summary_publications" &&
      objects.rows[0]?.slots === "reader_summary_publication_slots" &&
      objects.rows[0]?.publisher === "publish_reader_summary(jsonb)",
    "ordered upgrade must install publication ledger, slot, and function",
  );
};

const assertLegacyTablesOwnedByRuntime = async (
  databaseUrl: string,
  applicationRole: string,
): Promise<void> => {
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const owners = await admin.query<{
      readonly artifact_owner: string;
      readonly job_owner: string;
      readonly migration_owner: string;
      readonly outbox_owner: string;
    }>(
      `SELECT
         pg_get_userbyid((SELECT relowner FROM pg_class
           WHERE oid = 'reader_summary_artifacts'::regclass)) AS artifact_owner,
         pg_get_userbyid((SELECT relowner FROM pg_class
           WHERE oid = 'reader_summary_jobs'::regclass)) AS job_owner,
         pg_get_userbyid((SELECT relowner FROM pg_class
           WHERE oid = '_prisma_migrations'::regclass)) AS migration_owner,
         pg_get_userbyid((SELECT relowner FROM pg_class
           WHERE oid = 'outbox_events'::regclass)) AS outbox_owner`,
    );
    assertDeepEqual(
      owners.rows[0],
      {
        artifact_owner: applicationRole,
        job_owner: applicationRole,
        migration_owner: applicationRole,
        outbox_owner: applicationRole,
      },
      "ordered legacy migrations must reproduce runtime-owned production tables before bootstrap",
    );
  } finally {
    await admin.end();
  }
};

const assertSemanticReplay = async (
  client: PoolClient,
  status: "COMPLETED" | "NO_SIGNAL",
  day: number,
): Promise<void> => {
  const fixture = await createRunningFixture(client, status, day);
  const first = await publish(client, fixture.payload);
  const replay = await publish(client, reverseObject(fixture.payload));
  assert(first === "published", `${status} first publication must win`);
  assert(replay === "replayed", `${status} semantic JSON replay must succeed`);
  const conflictingReplay = JSON.parse(
    JSON.stringify(fixture.payload),
  ) as Record<string, unknown>;
  conflictingReplay.readyEvent = {
    ...(conflictingReplay.readyEvent as Record<string, unknown>),
    eventId: randomUUID(),
  };
  await assertRejects(
    () => publish(client, conflictingReplay),
    `${status} replay with a different outbox event id must conflict`,
  );
  await assertRejectsContaining(
    () =>
      client.query(
        `INSERT INTO reader_summary_publications
         SELECT * FROM reader_summary_publications
          WHERE reader_summary_job_id = $1`,
        [fixture.jobId],
      ),
    "permission denied",
    `${status} direct exact-ledger insert must be rejected`,
  );
  await assertRejectsContaining(
    () =>
      client.query(
        `UPDATE reader_summary_publication_slots
            SET current_publication_id = current_publication_id
          WHERE current_publication_id = $1`,
        [fixture.artifactId],
      ),
    "permission denied",
    `${status} direct active-slot update must be rejected`,
  );

  const counts = await client.query<{
    readonly publications: string;
    readonly outbox: string;
    readonly visible: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_publications
         WHERE reader_summary_job_id = $1) AS publications,
       (SELECT count(*) FROM outbox_events WHERE id = $2) AS outbox,
       (SELECT count(*) FROM reader_summary_artifacts
         WHERE id = $3 AND status = $4::"SummaryStatus") AS visible`,
    [fixture.jobId, fixture.eventId, fixture.artifactId, status],
  );
  assert(
    counts.rows[0]?.publications === "1" &&
      counts.rows[0]?.outbox === "1" &&
      counts.rows[0]?.visible === "1",
    `${status} replay must retain one proof, outbox event, and visible artifact`,
  );
};

const assertMissingBindingsFailClosed = async (
  client: PoolClient,
  day: number,
): Promise<void> => {
  const fixture = await createRunningFixture(client, "COMPLETED", day);
  for (const field of [
    "schemaVersion",
    "requestedUtcDate",
    "requestedAt",
    "reportSha256",
    "proofSha256",
  ]) {
    const invalid = { ...fixture.payload } as Record<string, unknown>;
    delete invalid[field];
    await assertRejects(
      () => publish(client, invalid),
      `missing incoming ${field} must fail closed`,
    );
  }
  await assertNoPublication(client, fixture);
};

const assertOlderStrongModelFailsClosed = async (
  client: PoolClient,
  day: number,
): Promise<void> => {
  const current = await createRunningFixture(client, "COMPLETED", day, {
    modelVersion: "deterministic-reader-summary-v1",
    requestedAt: utc(day, 10),
  });
  assert((await publish(client, current.payload)) === "published", "fixture");
  const stale = await createRunningFixture(client, "COMPLETED", day, {
    modelVersion: "codex:gpt-5.5:xhigh",
    requestedAt: utc(day, 9),
  });
  assert(
    (await publish(client, stale.payload)) === "stale",
    "older generation must fail before stronger model authority can win",
  );
  await assertNoPublication(client, stale);

  const newer = await createRunningFixture(client, "COMPLETED", day, {
    modelVersion: "codex:gpt-5.5:xhigh",
    requestedAt: utc(day, 11),
  });
  assert(
    (await publish(client, newer.payload)) === "published",
    "strictly newer stronger generation must supersede",
  );
  const evidence = await client.query<{
    readonly current_publication_id: string;
    readonly previous_status: string;
  }>(
    `SELECT slot.current_publication_id,
            previous.status::text AS previous_status
       FROM reader_summary_publication_slots slot
       JOIN reader_summary_artifacts previous ON previous.id = $1
      WHERE slot.period_started_at = $2`,
    [current.artifactId, periodStart(day)],
  );
  assertDeepEqual(
    evidence.rows[0],
    {
      current_publication_id: newer.artifactId,
      previous_status: "SUPERSEDED",
    },
    "newer publication must atomically replace the slot and supersede immutable history",
  );
};

const assertExactlyOneRaceWinner = async (
  first: PoolClient,
  second: PoolClient,
  day: number,
): Promise<void> => {
  const requestedAt = utc(day, 10);
  const left = await createRunningFixture(first, "COMPLETED", day, {
    requestedAt,
    modelVersion: "codex:gpt-5.5:xhigh",
  });
  const right = await createRunningFixture(first, "COMPLETED", day, {
    requestedAt,
    modelVersion: "codex:gpt-5.5:xhigh",
  });
  const outcomes = await Promise.all([
    publish(first, left.payload),
    publish(second, right.payload),
  ]);
  assertDeepEqual(
    [...outcomes].sort(),
    ["published", "stale"],
    "real equal-requestedAt race must have exactly one winner",
  );

  const evidence = await first.query<{
    readonly current_slots: string;
    readonly publications: string;
    readonly outbox: string;
    readonly visible: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_publication_slots
         WHERE period_started_at = $1) AS current_slots,
       (SELECT count(*) FROM reader_summary_publications
         WHERE period_started_at = $1) AS publications,
       (SELECT count(*) FROM outbox_events
         WHERE id = ANY($2::uuid[])) AS outbox,
       (SELECT count(*) FROM reader_summary_artifacts
         WHERE period_started_at = $1
           AND status IN ('COMPLETED', 'NO_SIGNAL')) AS visible`,
    [periodStart(day), [left.eventId, right.eventId]],
  );
  assert(
    evidence.rows[0]?.current_slots === "1" &&
      evidence.rows[0]?.publications === "1" &&
      evidence.rows[0]?.outbox === "1" &&
      evidence.rows[0]?.visible === "1",
    "real race must commit one slot, proof, outbox event, and public artifact",
  );
};

const assertConcurrentSemanticReplay = async (
  first: PoolClient,
  second: PoolClient,
  day: number,
): Promise<void> => {
  const fixture = await createRunningFixture(first, "COMPLETED", day);
  const outcomes = await Promise.all([
    publish(first, fixture.payload),
    publish(second, reverseObject(fixture.payload)),
  ]);
  assertDeepEqual(
    [...outcomes].sort(),
    ["published", "replayed"],
    "concurrent semantic JSON delivery must publish once and replay once",
  );
  await assertPublishedExactlyOnce(first, fixture, "COMPLETED");
};

type Fixture = Readonly<{
  jobId: string;
  artifactId: string;
  eventId: string;
  payload: Readonly<Record<string, unknown>>;
}>;

const createRunningFixture = async (
  client: PoolClient,
  status: "COMPLETED" | "NO_SIGNAL",
  day: number,
  overrides: {
    readonly requestedAt?: string;
    readonly modelVersion?: string;
  } = {},
): Promise<Fixture> => {
  const tenantId = "00000000-0000-7000-8000-000000000001";
  const workspaceId = "00000000-0000-7000-8000-000000000002";
  const jobId = randomUUID();
  const artifactId = randomUUID();
  const eventId = randomUUID();
  const requestedAt = overrides.requestedAt ?? utc(day, 10);
  const modelVersion = overrides.modelVersion ?? "codex:gpt-5.5:xhigh";
  const startedAt = periodStart(day);
  const endedAt = periodEnd(day);
  const periodKey = `daily:${startedAt}:${endedAt}:UTC`;
  await client.query(
    `INSERT INTO reader_summary_jobs (
       id, tenant_id, workspace_id, scope_type, scope_key, cadence,
       period_started_at, period_ended_at, period_timezone, period_key,
       status, idempotency_key, requested_at, started_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, 'workspace', 'workspace', 'daily', $4, $5, 'UTC', $6,
       'RUNNING', $7, $8, $8, $8, $8
     )`,
    [
      jobId,
      tenantId,
      workspaceId,
      startedAt,
      endedAt,
      periodKey,
      `publication-gate:${jobId}`,
      requestedAt,
    ],
  );

  const qualityFlags = status === "NO_SIGNAL" ? ["no_signal"] : [];
  const promptVersion = "reader-summary.prompt.pg-gate.v1";
  const scope = { type: "workspace" } as const;
  const period = {
    cadence: "daily",
    startedAt,
    endedAt,
    timezone: "UTC",
    periodKey,
  } as const;
  const report = canonicalObject({
    schemaVersion: "reader_summary.publication_report.v1",
    semanticStatus: status,
    modelVersion,
    promptVersion,
    headline: status === "NO_SIGNAL" ? "No reliable signal" : "Proved report",
    summaryText:
      status === "NO_SIGNAL" ? "No eligible evidence." : "Exact report body.",
    artifactPayload: {
      schemaVersion: "reader_summary.artifact.v1",
      readerSummaryId: artifactId,
      tenantId,
      workspaceId,
      scope,
      period,
      headline: status === "NO_SIGNAL" ? "No reliable signal" : "Proved report",
      executiveSummary:
        status === "NO_SIGNAL" ? "No eligible evidence." : "Exact report body.",
      lineage: { modelVersion, promptVersion },
      citationMap: [],
      qualityFlags,
    },
    citations: [],
    qualitySignals: {
      qualityFlags,
      publicationDecision: { status: "published", qualityPassed: true },
      publicationGeneration: { requestedAt },
    },
  });
  const reportCanonical = stableJson(report);
  const reportSha256 = sha256(reportCanonical);
  const exactProof = canonicalObject({
    schemaVersion: "reader_summary.publication_proof.v1",
    tenantId,
    workspaceId,
    scope: { type: "workspace", key: "workspace" },
    period: {
      cadence: "daily",
      startedAt,
      endedAt,
      timezone: "UTC",
      periodKey,
    },
    requestedUtcDate: requestedAt.slice(0, 10),
    requestedAt,
    readerSummaryJobId: jobId,
    readerSummaryArtifactId: artifactId,
    semanticStatus: status,
    modelVersion,
    reportSha256,
  });
  const proofCanonical = stableJson(exactProof);
  const payload = canonicalObject({
    schemaVersion: "reader_summary.publication.v1",
    tenantId,
    workspaceId,
    scopeType: "workspace",
    scopeKey: "workspace",
    cadence: "daily",
    periodStartedAt: startedAt,
    periodEndedAt: endedAt,
    periodTimezone: "UTC",
    periodKey,
    requestedUtcDate: requestedAt.slice(0, 10),
    requestedAt,
    readerSummaryJobId: jobId,
    readerSummaryArtifactId: artifactId,
    semanticStatus: status,
    modelVersion,
    publishedAt: utc(day, 11),
    report,
    reportCanonical,
    reportSha256,
    exactProof,
    proofCanonical,
    proofSha256: sha256(proofCanonical),
    readyEvent: {
      eventId,
      eventType: "reader_summary.ready",
      schemaVersion: 1,
      occurredAt: utc(day, 11),
      tenantId,
      workspaceId,
      correlationId: jobId,
      causationId: jobId,
      payload: {
        readerSummaryJobId: jobId,
        readerSummaryId: artifactId,
        tenantId,
        workspaceId,
        scope,
        period,
        status: status === "NO_SIGNAL" ? "no_signal" : "completed",
      },
    },
  });

  await client.query(
    `INSERT INTO reader_summary_artifacts (
       id, tenant_id, workspace_id, scope_type, scope_key, cadence,
       period_started_at, period_ended_at, period_timezone, period_key,
       status, schema_version, model_version, prompt_version, headline,
       summary_text, artifact_payload, citations, quality_signals,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, 'workspace', 'workspace', 'daily', $4, $5, 'UTC', $6,
       'RUNNING', 1, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb,
       $14, $14
     )`,
    [
      artifactId,
      tenantId,
      workspaceId,
      startedAt,
      endedAt,
      periodKey,
      modelVersion,
      promptVersion,
      report.headline,
      report.summaryText,
      JSON.stringify(report.artifactPayload),
      JSON.stringify(report.citations),
      JSON.stringify(report.qualitySignals),
      requestedAt,
    ],
  );

  return { jobId, artifactId, eventId, payload };
};

const assertNoPublication = async (
  client: PoolClient,
  fixture: Fixture,
): Promise<void> => {
  const rows = await client.query<{
    readonly publications: string;
    readonly public_artifacts: string;
    readonly candidates: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_publications
         WHERE reader_summary_job_id = $1
            OR reader_summary_artifact_id = $2) AS publications,
       (SELECT count(*) FROM reader_summary_artifacts
         WHERE id = $2 AND status IN ('COMPLETED', 'NO_SIGNAL')) AS public_artifacts,
       (SELECT count(*) FROM reader_summary_artifacts
         WHERE id = $2 AND status = 'RUNNING') AS candidates`,
    [fixture.jobId, fixture.artifactId],
  );
  assert(
    rows.rows[0]?.publications === "0" &&
      rows.rows[0]?.public_artifacts === "0" &&
      rows.rows[0]?.candidates === "1",
    "failed-closed attempt became public or lost its hidden candidate state",
  );
};

const assertPublishedExactlyOnce = async (
  client: PoolClient,
  fixture: Fixture,
  status: "COMPLETED" | "NO_SIGNAL",
): Promise<void> => {
  const counts = await client.query<{
    readonly publications: string;
    readonly outbox: string;
    readonly visible: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_publications
         WHERE reader_summary_job_id = $1) AS publications,
       (SELECT count(*) FROM outbox_events WHERE id = $2) AS outbox,
       (SELECT count(*) FROM reader_summary_artifacts
         WHERE id = $3 AND status = $4::"SummaryStatus") AS visible`,
    [fixture.jobId, fixture.eventId, fixture.artifactId, status],
  );
  assert(
    counts.rows[0]?.publications === "1" &&
      counts.rows[0]?.outbox === "1" &&
      counts.rows[0]?.visible === "1",
    `${status} must retain one proof, outbox event, and public artifact`,
  );
};

const publish = async (
  client: PoolClient,
  payload: Readonly<Record<string, unknown>>,
): Promise<string> => {
  const result = await client.query<{ readonly outcome: string }>(
    `SELECT outcome FROM publish_reader_summary($1::jsonb)`,
    [JSON.stringify(payload)],
  );
  const outcome = result.rows[0]?.outcome;
  assert(outcome !== undefined, "publication function returned no outcome");
  return outcome;
};

const preparePrePublicationMigrations = (): void => {
  cpSync("prisma/schema.prisma", join(migrationWorkspace, "schema.prisma"));
  const targetMigrations = join(migrationWorkspace, "migrations");
  mkdirSync(targetMigrations);
  for (const migration of migrationNames()) {
    if (migration === publicationMigration) {
      continue;
    }
    cpSync(
      join("prisma/migrations", migration),
      join(targetMigrations, migration),
      { recursive: true },
    );
  }
};

const installPublicationMigration = (): void => {
  cpSync(
    join("prisma/migrations", publicationMigration),
    join(migrationWorkspace, "migrations", publicationMigration),
    { recursive: true },
  );
};

const migrationNames = (): readonly string[] =>
  readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const applyOrderedMigrations = (url: string, schemaPath: string): void => {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "prisma",
      "migrate",
      "deploy",
      "--config",
      "scripts/reader-summary-publication-prisma.config.ts",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: url,
        READER_SUMMARY_PUBLICATION_TEST_SCHEMA_PATH: schemaPath,
        READER_SUMMARY_PUBLICATION_TEST_MIGRATIONS_PATH: join(
          dirname(schemaPath),
          "migrations",
        ),
      },
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    throw new Error("ordered baseline migration upgrade failed");
  }
};

const assertMigrationDatabaseMatchesPrismaSchema = (url: string): void => {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: url },
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    throw new Error(
      "ordered baseline and forward migrations must exactly match the Prisma schema",
    );
  }
};

const postgresBackendPid = async (client: PoolClient): Promise<number> => {
  const result = await client.query<{ readonly pid: number }>(
    "SELECT pg_backend_pid() AS pid",
  );
  const pid = result.rows[0]?.pid;
  if (pid === undefined) {
    throw new Error("PostgreSQL connection returned no backend pid");
  }
  return pid;
};

const periodStart = (day: number): string => utc(day, 0);
const periodEnd = (day: number): string => utc(day + 1, 0);
const utc = (day: number, hour: number): string =>
  new Date(Date.UTC(2026, 6, day, hour)).toISOString();

const reverseObject = (
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(value).reverse());

const canonicalObject = (
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  JSON.parse(stableJson(value)) as Readonly<Record<string, unknown>>;

const stableJson = (value: unknown): string =>
  JSON.stringify(canonicalValue(value));

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter((entry) => entry[1] !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(
      `${name} is required; the PostgreSQL publication gate never skips`,
    );
  }
  return value;
}

const assertRejects = async (
  operation: () => Promise<unknown>,
  message: string,
): Promise<void> => {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(message);
};

const assertRejectsContaining = async (
  operation: () => Promise<unknown>,
  expectedMessage: string,
  assertionMessage: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error: unknown) {
    assert(
      error instanceof Error && error.message.includes(expectedMessage),
      assertionMessage,
    );
    return;
  }
  throw new Error(assertionMessage);
};

const assertDeepEqual = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

const assert: (condition: boolean, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await serverAdmin.end();
  });
