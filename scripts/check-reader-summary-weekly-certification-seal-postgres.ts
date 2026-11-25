import {
  closeReaderSummaryPublicationPostgresContract,
  runReaderSummaryPublicationPostgresContract,
} from "./check-reader-summary-publication-postgres";

void runReaderSummaryPublicationPostgresContract(
  "weekly-certification-seal",
)
  .then(() => {
    console.log(
      "Reader summary weekly certification seal PostgreSQL gate OK",
    );
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(closeReaderSummaryPublicationPostgresContract);
