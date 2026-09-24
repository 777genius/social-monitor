import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";

import { reserveRecovery } from "./hn-rss-recovery-journal";

const [directory, digest, scopeJson, effectPath] = process.argv.slice(2);
if (directory === undefined || digest === undefined || scopeJson === undefined) throw new Error("Synthetic worker arguments missing");
try {
  reserveRecovery(directory, digest, JSON.parse(scopeJson));
  if (effectPath !== undefined) {
    // Synthetic committed effect followed by process exit without a receipt.
    const fd = openSync(effectPath, "wx", 0o600);
    try { writeSync(fd, "committed\n"); fsyncSync(fd); } finally { closeSync(fd); }
    process.kill(process.pid, "SIGKILL");
  }
  process.stdout.write("RESERVED\n");
} catch {
  process.stdout.write("REFUSED\n");
}
