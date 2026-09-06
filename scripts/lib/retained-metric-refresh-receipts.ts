import { createHash } from "node:crypto";
import type { MetricRefreshOperation, MetricRefreshOperationAuthority } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-operation.contracts";
import { metricRefreshEvidencePath } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-admission";
import { RetainedMetricJournal, type MetricJournalCheckpoint } from "./retained-metric-journal";

export function metricRefreshDigest(value: unknown): string {
  return createHash("sha256").update(canonicalMetricRefreshJson(value)).digest("hex");
}
export function canonicalMetricRefreshJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalMetricRefreshJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonicalMetricRefreshJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function decodeMetricEnvelope<T>(bytes: Buffer): T {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text).equals(bytes)) throw new Error("Invalid metric UTF-8");
  let depth = 0, quoted = false, escaped = false;
  for (const char of text) {
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") { if (++depth > 32) throw new Error("Metric evidence depth limit"); }
    else if (char === "}" || char === "]") depth--;
  }
  const envelope = JSON.parse(text) as { digest: string; value: T };
  if (!envelope || Object.keys(envelope).sort().join() !== "digest,value" || envelope.digest !== metricRefreshDigest(envelope.value)) throw new Error("Metric refresh receipt digest mismatch");
  if (canonicalMetricRefreshJson(envelope) !== text) throw new Error("Noncanonical metric evidence or duplicate keys");
  return envelope.value;
}
export class SecureMetricRefreshReceipts implements MetricRefreshOperationAuthority {
  constructor(private readonly maintenance: () => void, private readonly testRoot?: string, private readonly checkpoint?: MetricJournalCheckpoint) {}
  static forTest(root: string, checkpoint?: MetricJournalCheckpoint) {
    if (process.env.NODE_ENV !== "test") throw new Error("Metric test receipts unavailable");
    return new SecureMetricRefreshReceipts(() => {}, root, checkpoint);
  }
  async withOperation<T>(work: (operation: MetricRefreshOperation) => Promise<T>): Promise<T> {
    const journal = new RetainedMetricJournal(this.maintenance, this.testRoot, this.checkpoint);
    const operation: MetricRefreshOperation = {
      assertHeld: journal.assertHeld,
      read: async <V>(path: string) => { const bytes = journal.read(path); return bytes === null ? null : decodeMetricEnvelope<V>(bytes); },
      install: async (path, value) => journal.install(path, Buffer.from(canonicalMetricRefreshJson({ digest: metricRefreshDigest(value), value }))),
      entries: async () => {
        const entries = journal.entries();
        // The entire namespace must parse canonically, even an unused orphan.
        for (const entry of entries) if (entry.name !== "operation.lock") await operation.read(`${metricRefreshEvidencePath}/${entry.name}`);
        return entries;
      },
    };
    try { return await work(operation); } finally { journal.close(); }
  }
  async read<T>(path: string): Promise<T | null> { return this.withOperation((operation) => operation.read<T>(path)); }
  async install(path: string, value: unknown) { return this.withOperation((operation) => operation.install(path, value)); }
}
