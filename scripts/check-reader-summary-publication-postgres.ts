import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Pool, type PoolClient } from "pg";
import {
  provisionReaderSummaryPublicationFixtureScope,
  readerSummaryPublicationBackendPid,
  readerSummaryPublicationFixtureScope,
  requiredReaderSummaryPublicationAdminDatabaseUrl,
  setReaderSummaryPublicationSessionScope,
} from "./lib/reader-summary-publication-postgres-fixture-scope";
import {
  applyOrderedReaderSummaryMigrations,
  assertReaderSummaryMigrationDatabaseMatchesSchema,
  createReaderSummaryPublicationMigrationWorkspace,
  installPublicationAndFollowingMigrations,
  preparePrePublicationMigrations,
  readerSummaryMigrationNames,
  readerSummaryPublicationMigration,
  removeReaderSummaryPublicationMigrationWorkspace,
} from "./lib/reader-summary-publication-postgres-migrations";
import {
  assertPostgres as assert,
  assertPostgresDeepEqual as assertDeepEqual,
  assertPostgresRejects as assertRejects,
  assertPostgresRejectsContaining as assertRejectsContaining,
} from "./lib/reader-summary-publication-postgres-assertions";
import {
  createReaderSummaryPublicationRunningFixture as createRunningFixture,
  readerSummaryPublicationPeriodStart as periodStart,
  readerSummaryPublicationUtc as utc,
  type ReaderSummaryPublicationRunningFixture as Fixture,
} from "./lib/reader-summary-publication-postgres-running-fixture";
import { assertReaderSummaryRecoveryPostgresContract } from "./lib/reader-summary-recovery-postgres-contract";
import { assertReaderSummaryWeeklyDailyCertificationBackfillPostgresContract } from "./lib/reader-summary-weekly-daily-certification-backfill-postgres-contract";
import { assertReaderSummaryWeeklyCertificationSealPostgresContract } from "./lib/reader-summary-weekly-certification-seal-postgres-contract";
import { assertReaderSummaryWeeklyAtomicPublicationPostgresContract } from "./lib/reader-summary-weekly-atomic-publication-postgres-contract";
import { assertReaderSummaryWeeklyProjectionPostgresContract } from "./lib/reader-summary-weekly-projection-postgres-contract";
import { assertReaderSummaryWeeklyReviewManifestPostgresContract } from "./lib/reader-summary-weekly-review-manifest-postgres-contract";
import {
  assertReaderSummaryWeeklyProductionPostgresContract,
} from "./lib/reader-summary-weekly-production-postgres-contract";
import {
  assertReaderSummaryWeeklyPublicationEvidencePostgresContract,
  assertReaderSummaryWeeklyPublicationEvidenceRow,
  readerSummaryPublicationDbOwnedRequest,
} from "./lib/reader-summary-weekly-publication-evidence-postgres-contract";
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
  provisionPublicationFixtureDailyTerminalRole,
  publicationRuntimeDatabaseUrl,
  quotePostgresIdentifier,
  quotePostgresLiteral,
  runReaderSummaryPublicationBootstrapSql,
} from "./reader-summary-publication-postgres-privileges";
import { assertReaderSummaryPublicationRuntimeGuard } from "./reader-summary-publication-postgres-runtime-guard";
const serverAdminDatabaseUrl = requiredReaderSummaryPublicationAdminDatabaseUrl(
  process.env,
);
const fixtureSuffix = randomBytes(10).toString("hex");
const databaseName = `reader_summary_publication_test_${fixtureSuffix}`;
const migrationAdminRole = `social_monitor_publication_admin_${fixtureSuffix}`;
const migrationAdminPassword = randomBytes(24).toString("base64url");
const runtimeRole = `social_monitor_publication_test_${fixtureSuffix}`;
const runtimePassword = randomBytes(24).toString("base64url");
const dailyTerminalPassword = randomBytes(24).toString("base64url");
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
const migrationWorkspace = createReaderSummaryPublicationMigrationWorkspace();
let ownerRolePreexisting = false;
let capabilityRolePreexisting = false;
let schemaOwnerRolePreexisting = false;
let tenantSystemCapabilityRolePreexisting = false;
let dailyActivationDefinerRolePreexisting = false;
let fixtureDatabaseCreated = false;
let fixtureMigrationAdminRoleCreated = false;
let fixtureRuntimeRoleCreated = false;
let fixtureDailyTerminalRoleCreated = false;
export type ReaderSummaryPublicationPostgresContract =
  | "feed-promotion"
  | "publication"
  | "weekly-certification-seal"
  | "weekly-atomic-publication"
  | "weekly-projection"
  | "weekly-review-manifest";

export const closeReaderSummaryPublicationPostgresContract = async (
): Promise<void> => {
  await serverAdmin.end();
};

export const runReaderSummaryPublicationPostgresContract = async (
  contract: ReaderSummaryPublicationPostgresContract = "publication",
): Promise<void> => {
  assert(
    /^reader_summary_publication_test_[0-9a-f]{20}$/.test(databaseName),
    "temporary publication database name must be bounded",
  );
  const protectedRoles = await publicationProtectedRolePresence(serverAdmin);
  ownerRolePreexisting = protectedRoles.owner;
  capabilityRolePreexisting = protectedRoles.capability;
  schemaOwnerRolePreexisting = protectedRoles.schemaOwner;
  tenantSystemCapabilityRolePreexisting = protectedRoles.tenantSystemCapability;
  dailyActivationDefinerRolePreexisting = protectedRoles.dailyActivationDefiner;
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
      migrationAdminDatabaseUrl: adminDatabaseUrl,
      migrationAdminRole,
      runtimeRole,
      systemRuntimeRole: runtimeRole,
      targetDatabaseUrl,
    });

    preparePrePublicationMigrations(migrationWorkspace);
    await grantLegacyMigrationOwnership(adminDatabaseUrl, runtimeRole);
    applyOrderedReaderSummaryMigrations(runtimeDatabaseUrl, migrationWorkspace);
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
    fixtureDailyTerminalRoleCreated =
      await provisionPublicationFixtureDailyTerminalRole({
        dailyTerminalPassword,
        migrationAdminRole,
        serverAdmin,
      });
    installPublicationAndFollowingMigrations(migrationWorkspace);
    applyOrderedReaderSummaryMigrations(adminDatabaseUrl, migrationWorkspace);
    // Recovery after Prisma committed but before the post hardening phase.
    await runReaderSummaryPublicationBootstrapSql(
      "pre",
      adminDatabaseUrl,
      runtimeRole,
    );
    applyOrderedReaderSummaryMigrations(adminDatabaseUrl, migrationWorkspace);
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
    assertReaderSummaryMigrationDatabaseMatchesSchema(targetDatabaseUrl);
    if (contract === "feed-promotion") {
      await assertFeedPromotionOwnerOrder();
      runFeedPromotionCheck("check:feed-promotion-keyset-plan-postgres");
      runFeedPromotionCheck("check:feed-promotion-index-recovery-postgres");
      console.log(
        "Feed promotion ordered-bootstrap PostgreSQL 18 contract OK",
      );
      return;
    }
    const auditorPool = new Pool({
      connectionString: targetDatabaseUrl,
      max: 1,
    });
    const admin = new Pool({ connectionString: adminDatabaseUrl, max: 2 });
    const runtime = new Pool({ connectionString: runtimeDatabaseUrl, max: 4 });
    try {
      await grantPublicationFixtureRuntimePrivileges(admin, runtimeRole);
      const auditor = await auditorPool.connect();
      const adminClient = await admin.connect();
      const first = await runtime.connect();
      const second = await runtime.connect();
      try {
        await provisionReaderSummaryPublicationFixtureScope(auditor);
        await Promise.all([
          setReaderSummaryPublicationSessionScope(first),
          setReaderSummaryPublicationSessionScope(second),
        ]);
        const [firstPid, secondPid] = await Promise.all([
          readerSummaryPublicationBackendPid(first),
          readerSummaryPublicationBackendPid(second),
        ]);
        assert(
          firstPid !== secondPid,
          "race must use two independent PostgreSQL connections",
        );
        await assertOrderedUpgrade(auditor);
        await assertLegacyPublicationUpgrade(
          auditor,
          readerSummaryPublicationMigration,
        );
        await assertLegacyRepositoryVisibility(runtimeDatabaseUrl);
        if (
          contract === "weekly-certification-seal" ||
          contract === "weekly-atomic-publication" ||
          contract === "weekly-projection" ||
          contract === "weekly-review-manifest"
        ) {
          await assertReaderSummaryWeeklyCertificationSealPostgresContract({
            adminClient,
            auditorClient: auditor,
            concurrentRuntimeClient: second,
            runtimeClient: first,
            runtimeRole,
            createFixture: (status, day, overrides) =>
              createRunningFixture(first, status, day, overrides),
            publish: (payload) => publish(first, payload),
            includeProjectionRevision: contract === "weekly-projection",
          });
          await assertReaderSummaryWeeklyProductionPostgresContract(first);
          if (
            contract === "weekly-atomic-publication" ||
            contract === "weekly-projection"
          ) {
            await assertReaderSummaryWeeklyAtomicPublicationPostgresContract({
              auditorClient: auditor,
              concurrentRuntimeClient: second,
              runtimeClient: first,
              runtimeRole,
            });
          }
          if (contract === "weekly-projection") {
            await assertReaderSummaryWeeklyProjectionPostgresContract(first);
          }
          if (contract === "weekly-review-manifest") {
            await assertReaderSummaryWeeklyReviewManifestPostgresContract({
              adminClient,
              auditorClient: auditor,
              concurrentRuntimeClient: second,
              runtimeClient: first,
              runtimeRole,
            });
          }
          return;
        }
        await assertReaderSummaryWeeklyPublicationEvidencePostgresContract({
          runtimeClient: first,
          canonicalJsonAuditor: auditor,
          createFixture: (status, day, overrides) =>
            createRunningFixture(first, status, day, overrides),
          publish: (payload) => publish(first, payload),
          assertNoPublication: (fixture) =>
            assertNoPublication(first, fixture),
        });
        await assertReaderSummaryWeeklyDailyCertificationBackfillPostgresContract({
          canonicalJsonAuditor: auditor,
          client: first,
          concurrentClient: second,
          tenantId: readerSummaryPublicationFixtureScope.tenantId,
          workspaceId: readerSummaryPublicationFixtureScope.workspaceId,
          createFixture: (status, date, overrides) =>
            createRunningFixture(first, status, date, overrides),
          publish: (payload) => publish(first, payload),
        });
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
        await assertSemanticReplay(first, auditor, "COMPLETED", 1);
        await assertSemanticReplay(first, auditor, "NO_SIGNAL", 2);
        await assertMissingBindingsFailClosed(first, 3);
        await assertOlderStrongModelFailsClosed(first, 4);
        await assertConcurrentSemanticReplay(first, second, 5);
        await assertExactlyOneRaceWinner(first, second, 6);
        await assertDbOwnedConcurrency(first, second, 10, 11);
        await assertReaderSummaryRecoveryPostgresContract({
          client: first,
          createFixture: (status, day, overrides) =>
            createRunningFixture(first, status, day, overrides),
          publish: (payload) => publish(first, payload),
        });
      } finally {
        auditor.release();
        adminClient.release();
        first.release();
        second.release();
      }
    } finally {
      await runtime.end();
      await admin.end();
      await auditorPool.end();
    }
  } finally {
    removeReaderSummaryPublicationMigrationWorkspace(migrationWorkspace);
    await dropPublicationFixtureDatabaseAndRoles({
      serverAdmin,
      databaseName,
      migrationAdminRole,
      runtimeRole,
      ownerRolePreexisting,
      capabilityRolePreexisting,
      schemaOwnerRolePreexisting,
      tenantSystemCapabilityRolePreexisting,
      dailyActivationDefinerRolePreexisting,
      fixtureDatabaseCreated,
      fixtureMigrationAdminRoleCreated,
      fixtureRuntimeRoleCreated,
      fixtureDailyTerminalRoleCreated,
    });
  }
  console.log(
    "Reader summary PostgreSQL privilege, upgrade, replay, and concurrency gate OK",
  );
};
const assertFeedPromotionOwnerOrder = async (): Promise<void> => {
  const admin = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
  try {
    const result = await admin.query<{
      readonly feed_owner: string;
      readonly safe_set_membership: boolean;
    }>(`SELECT
        pg_get_userbyid(relation.relowner) AS feed_owner,
        EXISTS (
          SELECT 1 FROM pg_auth_members membership
          JOIN pg_roles granted ON granted.oid = membership.roleid
          JOIN pg_roles member ON member.oid = membership.member
          WHERE granted.rolname = 'social_monitor_public_schema_owner'
            AND member.rolname = current_user
            AND NOT membership.admin_option
            AND NOT membership.inherit_option
            AND membership.set_option
        ) AS safe_set_membership
      FROM pg_class relation WHERE relation.oid = 'public.feed_items'::regclass`);
    assert(
      result.rows[0]?.feed_owner === "social_monitor_public_schema_owner" &&
        result.rows[0]?.safe_set_membership === true,
      "feed promotion indexes must follow the production table-owner transition",
    );
  } finally {
    await admin.end();
  }
};
const runFeedPromotionCheck = (script: string): void => {
  const result = spawnSync("npm", ["run", script], {
    env: { ...process.env, DATABASE_URL: adminDatabaseUrl },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed in the ordered-bootstrap fixture`);
  }
};
const assertOrderedUpgrade = async (client: PoolClient): Promise<void> => {
  const expected = readerSummaryMigrationNames();
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
    readonly finalizer: string | null;
    readonly publications: string | null;
    readonly recovery_receipts: string | null;
    readonly slots: string | null;
    readonly publisher: string | null;
  }>(
    `SELECT
       to_regclass('reader_summary_publications')::text AS publications,
       to_regclass('reader_summary_publication_slots')::text AS slots,
       to_regclass('reader_summary_recovery_receipts')::text AS recovery_receipts,
       to_regprocedure('publish_reader_summary(jsonb)')::text AS publisher,
       to_regprocedure('finalize_reader_summary_recovery(jsonb,jsonb)')::text
         AS finalizer`,
  );
  assert(
    objects.rows[0]?.publications === "reader_summary_publications" &&
      objects.rows[0]?.slots === "reader_summary_publication_slots" &&
      objects.rows[0]?.recovery_receipts ===
        "reader_summary_recovery_receipts" &&
      objects.rows[0]?.publisher === "publish_reader_summary(jsonb)" &&
      objects.rows[0]?.finalizer ===
        "finalize_reader_summary_recovery(jsonb,jsonb)",
    "ordered upgrade must install publication and recovery contracts",
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
  runtimeClient: PoolClient, canonicalJsonAuditor: PoolClient,
  status: "COMPLETED" | "NO_SIGNAL", day: number,
): Promise<void> => {
  const fixture = await createRunningFixture(runtimeClient, status, day);
  const first = await publish(runtimeClient, fixture.payload);
  const replay = await publish(runtimeClient, reverseObject(fixture.payload));
  assert(first === "published", `${status} first publication must win`);
  assert(replay === "replayed", `${status} semantic JSON replay must succeed`);
  await assertReaderSummaryWeeklyPublicationEvidenceRow(
    runtimeClient, canonicalJsonAuditor,
    fixture,
    status,
  );
  const conflictingReplay = JSON.parse(
    JSON.stringify(fixture.payload),
  ) as Record<string, unknown>;
  conflictingReplay.readyEvent = {
    ...(conflictingReplay.readyEvent as Record<string, unknown>),
    eventId: randomUUID(),
  };
  await assertRejects(
    () => publish(runtimeClient, conflictingReplay),
    `${status} replay with a different outbox event id must conflict`,
  );
  await assertRejectsContaining(
    () =>
      runtimeClient.query(
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
      runtimeClient.query(
        `UPDATE reader_summary_publication_slots
            SET current_publication_id = current_publication_id
          WHERE current_publication_id = $1`,
        [fixture.artifactId],
      ),
    "permission denied",
    `${status} direct active-slot update must be rejected`,
  );
  const counts = await runtimeClient.query<{
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
const assertDbOwnedConcurrency = async (
  first: PoolClient,
  second: PoolClient,
  replayDay: number,
  raceDay: number,
): Promise<void> => {
  const replay = await createRunningFixture(first, "COMPLETED", replayDay);
  const replayRequest = readerSummaryPublicationDbOwnedRequest(replay);
  assertDeepEqual(
    [...await Promise.all([
      publish(first, replayRequest),
      publish(second, replayRequest),
    ])].sort(),
    ["published", "replayed"],
    "concurrent V2 delivery must publish once and replay once",
  );
  await assertDbOwnedCardinality(first, replayDay, [replay.jobId]);
  const requestedAt = utc(raceDay, 10);
  const left = await createRunningFixture(first, "COMPLETED", raceDay, {
    requestedAt,
  });
  const right = await createRunningFixture(first, "COMPLETED", raceDay, {
    requestedAt,
  });
  assertDeepEqual(
    [...await Promise.all([
      publish(first, readerSummaryPublicationDbOwnedRequest(left)),
      publish(second, readerSummaryPublicationDbOwnedRequest(right)),
    ])].sort(),
    ["published", "stale"],
    "competing V2 slot publications must have exactly one winner",
  );
  await assertDbOwnedCardinality(first, raceDay, [left.jobId, right.jobId]);
};
const assertDbOwnedCardinality = async (
  client: PoolClient,
  day: number,
  jobIds: readonly string[],
): Promise<void> => {
  const result = await client.query<{
    readonly evidence: string; readonly outbox: string;
    readonly publications: string; readonly slots: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_publication_slots
         WHERE period_started_at = $1) AS slots,
       (SELECT count(*) FROM reader_summary_publications
         WHERE period_started_at = $1) AS publications,
       (SELECT count(*) FROM reader_summary_weekly_publication_evidence
         WHERE period_started_at = $1) AS evidence,
       (SELECT count(*) FROM outbox_events
         WHERE correlation_id = ANY($2::text[])) AS outbox`,
    [periodStart(day), jobIds],
  );
  assertDeepEqual(
    result.rows[0],
    { slots: "1", publications: "1", evidence: "1", outbox: "1" },
    "V2 concurrency must retain one slot, publication, evidence, and outbox event",
  );
};
const assertNoPublication = async (
  client: PoolClient,
  fixture: Fixture,
): Promise<void> => {
  const rows = await client.query<{
    readonly artifacts: string; readonly evidence: string; readonly jobs: string;
    readonly outbox: string; readonly publications: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_publications
         WHERE reader_summary_job_id = $1
            OR reader_summary_artifact_id = $2) AS publications,
       (SELECT count(*) FROM reader_summary_artifacts
         WHERE id = $2 AND status = 'RUNNING') AS artifacts,
       (SELECT count(*) FROM reader_summary_jobs
         WHERE id = $1 AND status = 'RUNNING') AS jobs,
       (SELECT count(*) FROM reader_summary_weekly_publication_evidence
         WHERE reader_summary_job_id = $1 OR reader_summary_artifact_id = $2) AS evidence,
       (SELECT count(*) FROM outbox_events WHERE correlation_id = $3::text) AS outbox`,
    [fixture.jobId, fixture.artifactId, fixture.jobId],
  );
  assert(
    rows.rows[0]?.publications === "0" &&
      rows.rows[0]?.artifacts === "1" && rows.rows[0]?.jobs === "1" &&
      rows.rows[0]?.evidence === "0" && rows.rows[0]?.outbox === "0",
    "failed-closed attempt wrote publication state or promoted its candidate",
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
const reverseObject = (
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(value).reverse());

if (require.main === module) {
  void runReaderSummaryPublicationPostgresContract()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeReaderSummaryPublicationPostgresContract();
    });
}
