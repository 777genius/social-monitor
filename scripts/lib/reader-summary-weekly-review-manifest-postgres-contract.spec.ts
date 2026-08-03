import { readFileSync } from "node:fs";

import {
  assertReaderSummaryWeeklyReviewManifestMigrationContract,
  readerSummaryWeeklyReviewManifestCatalogIsSecure,
  type ReaderSummaryWeeklyReviewManifestCatalogSnapshot,
} from "./reader-summary-weekly-review-manifest-postgres-contract";

describe("reader summary weekly review manifest PostgreSQL catalog contract", () => {
  it("accepts the intended isolated append-only contract and legal source ownership", () => {
    expect(
      readerSummaryWeeklyReviewManifestCatalogIsSecure(secureSnapshot(), 1),
    ).toBe(true);
    expect(() => assertReaderSummaryWeeklyReviewManifestMigrationContract(
      readFileSync(
        "prisma/migrations/20260802170000_reader_summary_weekly_review_manifest/migration.sql",
        "utf8",
      ),
    )).not.toThrow();
  });

  it.each([
    ["runtime table access", { runtime_select_only: false }],
    ["capability table ACL", { capability_table_acl: true }],
    ["public function EXECUTE", { public_function_execute: true }],
    ["concrete runtime function EXECUTE", { runtime_direct_execute: false }],
    ["append-only trigger set", { append_only_trigger_contract: [] }],
    ["tenant-prefixed scope/week UNIQUE constraint", { tenant_scope_week_unique_constraint: false }],
    ["unmanaged index", { unmanaged_index_count: "1" }],
    ["reserved alias", { function_definition: `${secureDefinition()} AS seal` }],
    ["table lock", { function_definition: `${secureDefinition()} LOCK TABLE ignored` }],
  ] as const)("fails closed for insecure %s", (_label, override) => {
    expect(
      readerSummaryWeeklyReviewManifestCatalogIsSecure(
        { ...secureSnapshot(), ...override },
        1,
      ),
    ).toBe(false);
  });

  it("fails closed when schema CREATE escapes the catalog or the query is ambiguous", () => {
    expect(
      readerSummaryWeeklyReviewManifestCatalogIsSecure(
        { ...secureSnapshot(), publication_owner_schema_create: true },
        1,
      ),
    ).toBe(false);
    expect(
      readerSummaryWeeklyReviewManifestCatalogIsSecure(secureSnapshot(), 2),
    ).toBe(false);
  });
});

const secureSnapshot = (): ReaderSummaryWeeklyReviewManifestCatalogSnapshot => ({
  append_only_trigger_contract: [
    "reader_summary_weekly_review_manifests_append_only_delete:11",
    "reader_summary_weekly_review_manifests_append_only_truncate:34",
    "reader_summary_weekly_review_manifests_append_only_update:19",
  ],
  capability_function_execute: false,
  capability_table_acl: false,
  database_owner_function_execute: false,
  database_owner_table_acl: false,
  function_definition: secureDefinition(),
  function_fixed_search_path: true,
  function_owner: "social_monitor_reader_summary_publication_owner",
  function_security_definer: true,
  manifest_function: "persist_reader_summary_weekly_review_manifest(jsonb)",
  mutation_function: "reject_reader_summary_weekly_review_manifest_mutation()",
  mutation_function_fixed_search_path: true,
  mutation_function_owner: "social_monitor_reader_summary_publication_owner",
  publication_owner_schema_create: false,
  public_function_execute: false,
  public_table_acl: false,
  rls_enabled: true,
  rls_forced: true,
  runtime_direct_execute: true,
  runtime_direct_select: true,
  runtime_select_only: true,
  table_name: "reader_summary_weekly_review_manifests",
  table_owner: "social_monitor_reader_summary_publication_owner",
  tenant_policy: true,
  tenant_scope_week_unique_constraint: true,
  unexpected_function_execute: false,
  unmanaged_index_count: "0",
});

function secureDefinition(): string {
  return `
  current_setting('transaction_isolation') <> 'serializable'
  FOR UPDATE
  FOR SHARE OF evidence_row
  DATE '2026-07-23'
  historical_unavailable
  missing sealed evidence
  cannot duplicate a story on one date
`;
}
