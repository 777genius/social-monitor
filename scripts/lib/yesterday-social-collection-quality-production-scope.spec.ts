import { readFileSync } from "node:fs";
import { join } from "node:path";

const checker = readFileSync(
  join(process.cwd(), "scripts/check-yesterday-social-collection-quality.ts"),
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
      "const summaryJobs = await querySummaryJobs(client, scope);",
      firstQualityRead,
    );
    const rowEvaluation = checker.indexOf(
      "const summaryWindowRows = visibleRows(publishedWindowFeedRows);",
      lastQualityRead,
    );

    expect(checker).toContain(
      'from "./lib/reader-summary-production-day-scope"',
    );
    expect(scopeSelection).toBeGreaterThan(-1);
    expect(systemAccess).toBeGreaterThan(scopeSelection);
    expect(firstQualityRead).toBeGreaterThan(systemAccess);
    expect(rowEvaluation).toBeGreaterThan(lastQualityRead);
  });

  it("does not broaden quality reads into legacy tenant or workspace scopes", () => {
    const queryBodies = [
      functionBody("queryFeedRowsByWindow", "function buildDataIntegrityReport"),
      functionBody("querySourceItemCounts", "async function querySummaryArtifacts"),
      functionBody("querySummaryArtifacts", "async function querySummaryJobs"),
      functionBody("querySummaryJobs", "function buildProviderReports"),
    ];

    for (const body of queryBodies) {
      expect(body).toMatch(/tenant_id = \$3::uuid/u);
      expect(body).toMatch(/workspace_id = \$4::uuid/u);
      expect(body).toContain("scope.tenantId");
      expect(body).toContain("scope.workspaceId");
    }

    expect(checker).not.toMatch(
      /query(?:FeedRows|PublishedWindowFeedRows|SourceItemCounts|SummaryArtifacts|SummaryJobs)\(client\)(?!,\s*scope)/u,
    );
  });
});

function functionBody(start: string, end: string): string {
  const startIndex = checker.indexOf(start);
  const endIndex = checker.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThan(-1);
  expect(endIndex).toBeGreaterThan(startIndex);
  return checker.slice(startIndex, endIndex);
}
