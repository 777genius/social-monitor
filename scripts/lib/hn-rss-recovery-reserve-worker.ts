import { reserveRecovery } from "./hn-rss-recovery-journal";

const [directory, digest, scopeJson] = process.argv.slice(2);
if (directory === undefined || digest === undefined || scopeJson === undefined) throw new Error("Synthetic worker arguments missing");
try {
  reserveRecovery(directory, digest, JSON.parse(scopeJson));
  process.stdout.write("RESERVED\n");
} catch {
  process.stdout.write("REFUSED\n");
}
