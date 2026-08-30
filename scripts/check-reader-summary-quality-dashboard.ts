import {
  assertReaderSummaryQualityDashboardIsCurrent,
  serializeReaderSummaryQualityDashboard,
  validateExistingReaderSummaryQualityDashboard,
  writeReaderSummaryQualityDashboard,
} from "./lib/reader-summary-quality-dashboard-artifact";
import { buildReaderSummaryQualityDashboardReport } from "./lib/reader-summary-quality-dashboard-report-builder";
import {
  readOption,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";

const databaseUrl = yesterdaySocialQualityDatabaseUrl();
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const allowDegraded = process.argv.includes("--allow-degraded");

void main();

async function main(): Promise<void> {
  if (artifactOnly) {
    validateExistingReaderSummaryQualityDashboard({ allowDegraded });
    return;
  }

  const report = await buildReaderSummaryQualityDashboardReport({
    databaseUrl,
    collectionDate: readOption("--date"),
  });

  if (report === undefined) {
    if (update) {
      throw new Error(
        "Local reader summary quality data source is unavailable; cannot update dashboard.",
      );
    }
    validateExistingReaderSummaryQualityDashboard({ allowDegraded });
    return;
  }

  const serialized = serializeReaderSummaryQualityDashboard(report);

  if (update) {
    writeReaderSummaryQualityDashboard(serialized);
    if (!report.blockingPassed && !allowDegraded) {
      throw new Error("Reader summary quality dashboard gates failed");
    }
    return;
  }

  if (!report.blockingPassed && !allowDegraded) {
    console.error(serialized);
    throw new Error("Reader summary quality dashboard gates failed");
  }

  assertReaderSummaryQualityDashboardIsCurrent(serialized);

  console.log(
    `Reader summary quality dashboard OK (${report.inputs.dayCount} days, degraded=${report.aggregate.degradedCleanDates.length})`,
  );
}
