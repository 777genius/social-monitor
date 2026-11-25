import type {
  VerifiedReaderSummaryExecutionAttestation,
  VerifiedReaderSummaryExecutionAttestationSink,
} from "@social-monitor/summary/adapters/model/reader-summary-execution-attestation";

export class DurableReaderSummaryExecutionAttestationCapture implements VerifiedReaderSummaryExecutionAttestationSink {
  private readonly records: VerifiedReaderSummaryExecutionAttestation[] = [];
  private readonly requestIds = new Set<string>();

  record(value: VerifiedReaderSummaryExecutionAttestation): void {
    if (this.requestIds.has(value.attestation.requestId)) {
      throw new Error("Duplicate reader summary execution attestation");
    }
    if (value.taskRole === "topic_label") {
      this.removeWhere(
        (record) =>
          record.taskRole === "topic_label" ||
          record.taskRole === "topic_relation",
      );
    } else if (value.taskRole === "summary") {
      this.removeWhere((record) => record.taskRole === "summary");
    }
    this.requestIds.add(value.attestation.requestId);
    this.records.push({
      taskRole: value.taskRole,
      attempt: value.attempt,
      normalizedOutputSha256: value.normalizedOutputSha256,
      attestation: { ...value.attestation },
    });
  }

  all(): readonly VerifiedReaderSummaryExecutionAttestation[] {
    return this.records.map((value) => ({
      taskRole: value.taskRole,
      attempt: value.attempt,
      normalizedOutputSha256: value.normalizedOutputSha256,
      attestation: { ...value.attestation },
    }));
  }

  private removeWhere(
    predicate: (value: VerifiedReaderSummaryExecutionAttestation) => boolean,
  ): void {
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      const record = this.records[index]!;
      if (predicate(record)) {
        this.records.splice(index, 1);
        this.requestIds.delete(record.attestation.requestId);
      }
    }
  }
}
