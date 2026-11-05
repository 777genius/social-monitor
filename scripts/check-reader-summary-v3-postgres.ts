import { closeReaderSummaryPublicationPostgresContract,
  runReaderSummaryPublicationPostgresContract } from
  "./check-reader-summary-publication-postgres";

void runReaderSummaryPublicationPostgresContract("promotion-v3")
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }).finally(closeReaderSummaryPublicationPostgresContract);
