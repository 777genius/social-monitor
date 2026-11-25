import { readFileSync } from "node:fs";
import { join } from "node:path";

const checker = readFileSync(
  join(process.cwd(), "scripts/check-yesterday-social-collection-quality.ts"),
  "utf8",
);
const summaryCounts = readFileSync(
  join(
    process.cwd(),
    "scripts/lib/yesterday-social-collection-quality-summary-counts.ts",
  ),
  "utf8",
);

describe("yesterday social collection quality production scope", () => {
  it("selects the production day scope and enables system access before reading rows", () => {
    const scopeSelection = checker.indexOf(
      "const scope = await readProductionDayScope({",
    );
    const systemAccess = checker.indexOf(
      "SELECT set_config('social_monitor.system_access', 'true', false)",
      scopeSelection,
    );
    const firstQualityRead = checker.indexOf(
      "const feedRows = await queryFeedRows(client, scope);",
      systemAccess,
    );
    const lastQualityRead = checker.indexOf(
      "const summaryEvidence = await queryCollectionQualitySummaryEvidenceCounts(",
      firstQualityRead,
    );
    const rowEvaluation = checker.indexOf(
      "const summaryWindowRows = visibleRows(",
      lastQualityRead,
    );

    expect(checker).toContain(
      'from "./lib/reader-summary-production-day-scope"',
    );
    expect(scopeSelection).toBeGreaterThan(-1);
    expect(systemAccess).toBeGreaterThan(scopeSelection);
    expect(firstQualityRead).toBeGreaterThan(systemAccess);
    expect(lastQualityRead).toBeGreaterThan(firstQualityRead);
    expect(rowEvaluation).toBeGreaterThan(lastQualityRead);
  });

  it("does not broaden quality reads into legacy tenant or workspace scopes", () => {
    const queryBodies = [
      functionBody(
        checker,
        "async function queryFeedRowsByWindow",
        "function buildDataIntegrityReport",
      ),
      functionBody(
        checker,
        "async function querySourceItemCounts",
        "function buildProviderReports",
      ),
      functionBody(
        summaryCounts,
        "export async function queryCollectionQualitySummaryEvidenceCounts",
        "return result.rows;",
      ),
    ];

    for (const body of queryBodies) {
      expect(body).toMatch(/tenant_id = \$3::uuid/u);
      expect(body).toMatch(/workspace_id = \$4::uuid/u);
      expect(body).toContain("scope.tenantId");
      expect(body).toContain("scope.workspaceId");
    }

    expect(checker).not.toMatch(
      /query(?:FeedRows|PublishedWindowFeedRows|SourceItemCounts|SummaryArtifacts|SummaryJobs|CollectionQualitySummaryEvidenceCounts)\(\s*client\s*(?:\)|,(?!\s*scope\b))/u,
    );
  });
});

function functionBody(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThan(-1);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}
