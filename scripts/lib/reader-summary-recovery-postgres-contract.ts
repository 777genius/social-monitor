import { createHash } from "node:crypto";

import type { PoolClient } from "pg";

import {
  buildReaderSummaryRecoveryReceiptPayload,
  type ReaderSummaryRecoveryFinalizationSqlRow,
} from "../../libs/summary/adapters/persistence/reader-summary-recovery-receipt";
import type { ReaderSummaryPublicationPayload } from "../../libs/summary/adapters/persistence/reader-summary-publication-proof";
import type { ReaderSummaryRecoveryProvenance } from "../../libs/summary/ports/reader-summary-recovery-finalization.port";

type PublicationFixture = Readonly<{
  jobId: string;
  artifactId: string;
  eventId: string;
  payload: Readonly<Record<string, unknown>>;
}>;

type FixtureOverrides = Readonly<{
  requestedAt?: string;
  modelVersion?: string;
}>;

export const assertReaderSummaryRecoveryPostgresContract = async (params: {
  readonly client: PoolClient;
  readonly createFixture: (
    status: "COMPLETED" | "NO_SIGNAL",
    day: number,
    overrides?: FixtureOverrides,
  ) => Promise<PublicationFixture>;
  readonly publish: (
    payload: Readonly<Record<string, unknown>>,
  ) => Promise<string>;
}): Promise<void> => {
  await assertRecoveryPrivilegeBoundary(params.client);
  await assertOrdinaryPublicationCompatibility(params);
  await assertFirstFinalizeReplayAndConflict(params);
  await assertRecoveryRollback(params);
};

const assertRecoveryPrivilegeBoundary = async (
  client: PoolClient,
): Promise<void> => {
  const boundary = await client.query<{
    readonly delete_receipt: boolean;
    readonly execute_finalizer: boolean;
    readonly execute_insert_guard: boolean;
    readonly function_owner: string;
    readonly function_security_definer: boolean;
    readonly function_settings: readonly string[] | null;
    readonly insert_receipt: boolean;
    readonly references_receipt: boolean;
    readonly receipt_owner: string;
    readonly select_receipt: boolean;
    readonly trigger_receipt: boolean;
    readonly trigger_count: string;
    readonly truncate_receipt: boolean;
    readonly update_receipt: boolean;
  }>(
    `SELECT
       has_table_privilege(current_user,
         'reader_summary_recovery_receipts', 'SELECT') AS select_receipt,
       has_table_privilege(current_user,
         'reader_summary_recovery_receipts', 'INSERT') AS insert_receipt,
       has_table_privilege(current_user,
         'reader_summary_recovery_receipts', 'UPDATE') AS update_receipt,
       has_table_privilege(current_user,
         'reader_summary_recovery_receipts', 'DELETE') AS delete_receipt,
       has_table_privilege(current_user,
         'reader_summary_recovery_receipts', 'TRUNCATE') AS truncate_receipt,
       has_table_privilege(current_user,
         'reader_summary_recovery_receipts', 'REFERENCES')
         AS references_receipt,
       has_table_privilege(current_user,
         'reader_summary_recovery_receipts', 'TRIGGER') AS trigger_receipt,
       has_function_privilege(current_user,
         'finalize_reader_summary_recovery(jsonb,jsonb)', 'EXECUTE')
         AS execute_finalizer,
       has_function_privilege(current_user,
         'guard_reader_summary_recovery_receipt_insert()', 'EXECUTE')
         AS execute_insert_guard,
       pg_get_userbyid(receipt.relowner) AS receipt_owner,
       pg_get_userbyid(finalizer.proowner) AS function_owner,
       finalizer.prosecdef AS function_security_definer,
       finalizer.proconfig AS function_settings,
       (
         SELECT count(*)
         FROM pg_trigger trigger
         WHERE trigger.tgrelid = receipt.oid
           AND trigger.tgname IN (
             'reader_summary_recovery_receipts_insert_guarded',
             'reader_summary_recovery_receipts_immutable'
           )
           AND trigger.tgenabled = 'O'
       ) AS trigger_count
     FROM pg_class receipt
     JOIN pg_proc finalizer ON finalizer.oid =
       'finalize_reader_summary_recovery(jsonb,jsonb)'::regprocedure
     WHERE receipt.oid = 'reader_summary_recovery_receipts'::regclass`,
  );
  assertDeepEqual(
    boundary.rows[0],
    {
      select_receipt: true,
      insert_receipt: false,
      update_receipt: false,
      delete_receipt: false,
      truncate_receipt: false,
      references_receipt: false,
      trigger_receipt: false,
      execute_finalizer: true,
      execute_insert_guard: false,
      receipt_owner: "social_monitor_reader_summary_publication_owner",
      function_owner: "social_monitor_reader_summary_publication_owner",
      function_security_definer: true,
      function_settings: ["search_path=pg_catalog, public, pg_temp"],
      trigger_count: "2",
    },
    "recovery receipt ownership, immutability, and runtime grants must be exact",
  );
};

const assertOrdinaryPublicationCompatibility = async (params: {
  readonly client: PoolClient;
  readonly createFixture: (
    status: "COMPLETED" | "NO_SIGNAL",
    day: number,
    overrides?: FixtureOverrides,
  ) => Promise<PublicationFixture>;
  readonly publish: (
    payload: Readonly<Record<string, unknown>>,
  ) => Promise<string>;
}): Promise<void> => {
  const fixture = await params.createFixture("COMPLETED", 7);
  assert(
    (await params.publish(fixture.payload)) === "published",
    "ordinary publication must remain compatible after recovery migration",
  );
  const provenance = recoveryProvenance(fixture.payload, "ordinary");
  await assertRejectsContaining(
    () => finalize(params.client, fixture, provenance),
    "finalized without a recovery receipt",
    "ordinary publication must not be relabeled as an atomic recovery",
  );
  const evidence = await params.client.query<{
    readonly publications: string;
    readonly receipts: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_publications
         WHERE reader_summary_job_id = $1) AS publications,
       (SELECT count(*) FROM reader_summary_recovery_receipts
         WHERE reader_summary_job_id = $1) AS receipts`,
    [fixture.jobId],
  );
  assertDeepEqual(
    evidence.rows[0],
    { publications: "1", receipts: "0" },
    "ordinary publication must retain its proof without a recovery receipt",
  );
};

const assertFirstFinalizeReplayAndConflict = async (params: {
  readonly client: PoolClient;
  readonly createFixture: (
    status: "COMPLETED" | "NO_SIGNAL",
    day: number,
    overrides?: FixtureOverrides,
  ) => Promise<PublicationFixture>;
}): Promise<void> => {
  const fixture = await params.createFixture("COMPLETED", 8);
  const provenance = recoveryProvenance(fixture.payload, "first");
  const first = await finalize(params.client, fixture, provenance);
  const replay = await finalize(params.client, fixture, provenance);
  assert(first.outcome === "published", "first recovery must publish");
  assert(replay.outcome === "replayed", "identical recovery must replay");
  assertDeepEqual(
    replay,
    { ...first, outcome: "replayed" },
    "identical recovery must return the original exact receipt",
  );

  const conflicting: ReaderSummaryRecoveryProvenance = {
    ...provenance,
    priorCollectionProof: {
      ...provenance.priorCollectionProof,
      sourceAttempt: {
        ...provenance.priorCollectionProof.sourceAttempt,
        sha256: digest("conflicting-source-attempt"),
      },
    },
  };
  await assertRejectsContaining(
    () => finalize(params.client, fixture, conflicting),
    "recovery provenance conflict",
    "same publication with conflicting provenance must fail closed",
  );
  await assertRejectsContaining(
    () =>
      params.client.query(
        `UPDATE reader_summary_recovery_receipts
            SET recorded_at = recorded_at
          WHERE publication_id = $1`,
        [fixture.artifactId],
      ),
    "permission denied",
    "runtime must not mutate an immutable recovery receipt",
  );

  const evidence = await params.client.query<{
    readonly publications: string;
    readonly receipts: string;
    readonly outbox: string;
    readonly visible: string;
    readonly receipt_matches_publication: boolean;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_publications
         WHERE reader_summary_job_id = $1) AS publications,
       (SELECT count(*) FROM reader_summary_recovery_receipts
         WHERE reader_summary_job_id = $1) AS receipts,
       (SELECT count(*) FROM outbox_events WHERE id = $2) AS outbox,
       (SELECT count(*) FROM reader_summary_artifacts
         WHERE id = $3 AND status = 'COMPLETED') AS visible,
       EXISTS (
         SELECT 1
         FROM reader_summary_recovery_receipts receipt
         JOIN reader_summary_publications publication
           ON publication.id = receipt.publication_id
         WHERE receipt.reader_summary_job_id = $1
           AND receipt.reader_summary_artifact_id = publication.reader_summary_artifact_id
           AND btrim(receipt.exact_receipt->>'reportSha256') = btrim(publication.report_sha256)
           AND btrim(receipt.exact_receipt->>'proofSha256') = btrim(publication.proof_sha256)
       ) AS receipt_matches_publication`,
    [fixture.jobId, fixture.eventId, fixture.artifactId],
  );
  assertDeepEqual(
    evidence.rows[0],
    {
      publications: "1",
      receipts: "1",
      outbox: "1",
      visible: "1",
      receipt_matches_publication: true,
    },
    "first finalize, replay, and conflict must retain one bound recovery",
  );
};

const assertRecoveryRollback = async (params: {
  readonly client: PoolClient;
  readonly createFixture: (
    status: "COMPLETED" | "NO_SIGNAL",
    day: number,
    overrides?: FixtureOverrides,
  ) => Promise<PublicationFixture>;
}): Promise<void> => {
  const original = await params.createFixture("COMPLETED", 9, {
    requestedAt: "2026-06-09T10:00:00.000Z",
  });
  const provenance = recoveryProvenance(original.payload, "rollback");
  await finalize(params.client, original, provenance);
  const conflicting = await params.createFixture("COMPLETED", 9, {
    requestedAt: "2026-06-09T11:00:00.000Z",
  });

  await assertRejectsContaining(
    () => finalize(params.client, conflicting, provenance),
    "recovery provenance conflict",
    "receipt conflict must roll back publication, proof, and visibility",
  );

  const evidence = await params.client.query<{
    readonly current_publication_id: string;
    readonly original_status: string;
    readonly conflicting_artifact_status: string;
    readonly conflicting_job_status: string;
    readonly publications: string;
    readonly receipts: string;
    readonly conflicting_outbox: string;
  }>(
    `SELECT
       slot.current_publication_id,
       original.status::text AS original_status,
       conflicting_artifact.status::text AS conflicting_artifact_status,
       conflicting_job.status::text AS conflicting_job_status,
       (SELECT count(*) FROM reader_summary_publications
         WHERE period_started_at = $3) AS publications,
       (SELECT count(*) FROM reader_summary_recovery_receipts
         WHERE publication_id IN ($1, $2)) AS receipts,
       (SELECT count(*) FROM outbox_events WHERE id = $4) AS conflicting_outbox
     FROM reader_summary_publication_slots slot
     JOIN reader_summary_artifacts original ON original.id = $1
     JOIN reader_summary_artifacts conflicting_artifact
       ON conflicting_artifact.id = $2
     JOIN reader_summary_jobs conflicting_job
       ON conflicting_job.id = $5
     WHERE slot.period_started_at = $3`,
    [
      original.artifactId,
      conflicting.artifactId,
      publicationPayload(original).periodStartedAt,
      conflicting.eventId,
      conflicting.jobId,
    ],
  );
  assertDeepEqual(
    evidence.rows[0],
    {
      current_publication_id: original.artifactId,
      original_status: "COMPLETED",
      conflicting_artifact_status: "RUNNING",
      conflicting_job_status: "RUNNING",
      publications: "1",
      receipts: "1",
      conflicting_outbox: "0",
    },
    "failed receipt insert must roll back every publication side effect",
  );
};

const finalize = async (
  client: PoolClient,
  fixture: PublicationFixture,
  provenance: ReaderSummaryRecoveryProvenance,
): Promise<ReaderSummaryRecoveryFinalizationSqlRow> => {
  const publication = publicationPayload(fixture);
  const receipt = buildReaderSummaryRecoveryReceiptPayload({
    publication,
    provenance,
  });
  const result = await client.query<ReaderSummaryRecoveryFinalizationSqlRow>(
    `SELECT * FROM finalize_reader_summary_recovery($1::jsonb, $2::jsonb)`,
    [JSON.stringify(publication), JSON.stringify(receipt)],
  );
  const row = result.rows[0];
  assert(row !== undefined, "recovery finalization returned no outcome");
  return row;
};

const recoveryProvenance = (
  payload: Readonly<Record<string, unknown>>,
  seed: string,
): ReaderSummaryRecoveryProvenance => {
  const publication = payload as unknown as ReaderSummaryPublicationPayload;
  return {
    schemaVersion: "reader_summary.summary_only_recovery_provenance.v1",
    mode: "summary-only",
    collectionUtcPeriod: {
      startedAt: publication.periodStartedAt,
      endedAt: publication.periodEndedAt,
      timezone: publication.periodTimezone,
    },
    priorCollectionProof: {
      sourceAttempt: {
        artifactFormat: "reader-summary-production-day-run-v1",
        sha256: digest(`${seed}:source-attempt`),
      },
      collectionArtifact: {
        artifactFormat: "reader-summary-clean-real-day-collection-v1",
        sha256: digest(`${seed}:collection-artifact`),
      },
      collectionQualityReport: {
        artifactFormat: "yesterday-social-collection-quality-report-v1",
        sha256: digest(`${seed}:collection-quality`),
      },
    },
    regenerationInputManifest: {
      artifactFormat: "reader-summary-day-dataset-manifest-v1",
      sha256: digest(`${seed}:dataset-manifest`),
      datasetSha256: digest(`${seed}:dataset`),
    },
  };
};

const publicationPayload = (
  fixture: PublicationFixture,
): ReaderSummaryPublicationPayload =>
  fixture.payload as unknown as ReaderSummaryPublicationPayload;

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

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
