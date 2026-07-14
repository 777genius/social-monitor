import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildReaderSummaryEditorialQualityReport,
  parseReaderSummaryEditorialQualityFixture,
} from "./lib/reader-summary-editorial-quality-gate";
import { normalizeLineEndings } from "./lib/yesterday-social-replay-support";

const fixturePath =
  "ops/evals/reader-summary-editorial-quality-fixture.v1.json";
const outputPath = "ops/evals/reader-summary-editorial-quality-report.v1.json";
const update = process.argv.includes("--update");

main();

function main(): void {
  const fixture = parseReaderSummaryEditorialQualityFixture(
    JSON.parse(readFileSync(fixturePath, "utf8")) as unknown,
  );
  const report = buildReaderSummaryEditorialQualityReport({
    fixture,
    fixturePath,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
  } else {
    if (!existsSync(outputPath)) {
      throw new Error(
        `${outputPath} is missing. Re-run with --update after reviewing the fixture.`,
      );
    }
    const committed = normalizeLineEndings(readFileSync(outputPath, "utf8"));
    if (committed !== serialized) {
      throw new Error(
        `${outputPath} is stale. Re-run with --update after reviewing recomputed policy results.`,
      );
    }
  }

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Reader summary editorial quality gates failed");
  }
  console.log(
    `Reader summary editorial quality OK (${report.days.length} fixture days)`,
  );
}
