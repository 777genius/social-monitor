/** Child process used only by the disposable PostgreSQL recovery contract. */
import { executeRecoveryAcquisitionInDisposableJournalForTest, openDisposableRecoveryAcquisitionFixture } from "./hn-rss-recovery-acquisition";
import { parseRecoveryArgs } from "./hn-rss-recovery-plan";
import { readBindingFromDatabase, runRecoveryInDisposableJournalForTest } from "../run-hn-rss-recovery";

async function main(): Promise<void> {
  const mode = process.argv[2];
  const databaseUrl = process.env.HN_RSS_RECOVERY_SYNTHETIC_RUNTIME_URL;
  if ((mode !== "run" && mode !== "crash") || databaseUrl === undefined) throw new Error("Synthetic worker setup missing");
  const fixture = await openDisposableRecoveryAcquisitionFixture(databaseUrl);
  try {
    const request = parseRecoveryArgs(process.argv.slice(3), new Date());
    const result = await runRecoveryInDisposableJournalForTest(request, {
      readBinding: (value) => readBindingFromDatabase(value, databaseUrl),
      acquire: async (value, binding, identity) => {
        process.stdout.write("SYNTHETIC_ACQUIRE\n");
        const acquired = await executeRecoveryAcquisitionInDisposableJournalForTest({ fixture, tenantId: value.tenantId, workspaceId: value.workspaceId,
          sourceBindingId: value.sourceBindingId, providerKey: value.providerKey, from: value.from, to: value.to,
          binding, ...identity }, value.journalDir);
        if (mode === "crash") {
          await fixture.close();
          process.exit(77);
        }
        return acquired;
      },
    });
    process.stdout.write(`${JSON.stringify({ status: result.status })}\n`);
  } finally {
    await fixture.close();
  }
}

void main().catch((error: unknown) => {
  const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
  const reservationRefused = code === "EEXIST" ||
    (error instanceof Error && error.message.includes("uncertain STARTED"));
  process.stderr.write(reservationRefused ? "SYNTHETIC_RESERVATION_REFUSED\n" : "SYNTHETIC_RECOVERY_FAILED\n");
  process.exitCode = 2;
});
