import {
  closeReaderSummaryPublicationPostgresContract,
  runReaderSummaryPublicationPostgresContract,
} from "./check-reader-summary-publication-postgres";

void runReaderSummaryPublicationPostgresContract("feed-promotion")
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeReaderSummaryPublicationPostgresContract();
  });
