import { createHash } from "node:crypto";
import type { MetricRefreshReceipts } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { installSecureRecoveryEvidenceFile, readSecureRecoveryEvidenceFile,
  type RecoveryEvidenceFilesystemTestHarness } from "./reader-summary-recovery-evidence-secure-file";

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
export class SecureMetricRefreshReceipts implements MetricRefreshReceipts {
  constructor(private readonly filesystem: RecoveryEvidenceFilesystemTestHarness = {
    read: readSecureRecoveryEvidenceFile, install: installSecureRecoveryEvidenceFile,
  }) {}
  async read<T>(path: string): Promise<T | null> {
    let bytes: Buffer;
    try { bytes = this.filesystem.read({ relativePath: path, label: "metric refresh receipt" }); }
    catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
    const envelope = JSON.parse(bytes.toString()) as { digest: string; value: T };
    if (envelope.digest !== metricRefreshDigest(envelope.value)) throw new Error("Metric refresh receipt digest mismatch");
    return envelope.value;
  }
  async install(path: string, value: unknown) {
    return this.filesystem.install({ relativePath: path, label: "metric refresh receipt",
      bytes: Buffer.from(canonicalMetricRefreshJson({ digest: metricRefreshDigest(value), value })) });
  }
}
