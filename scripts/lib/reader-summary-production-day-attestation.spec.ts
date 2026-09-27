import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import {
  isCurrentProductionSubscriptionRuntimeProvenance,
  runtimeProvenanceFromExecutorAttestations,
} from "./reader-summary-production-day-attestation";
import { productionExecutionAttestations } from "./reader-summary-production-day-attestation.spec-support";

const evidenceWith = (records: ReturnType<typeof productionExecutionAttestations>) => ({
  result: { selectedFeedItemCount: 1, status: "completed" },
  executionAttestations: records,
  durableReadback: {
    summaryContentSha256: "1".repeat(64), topicMapSha256: "2".repeat(64),
    executionAttestationSetSha256: canonicalJsonSha256(records),
  },
});

describe("production day purpose-specific executor identity", () => {
  it("accepts pinned MiMo for every daily task role and the repair purpose", () => {
    const records = productionExecutionAttestations();
    const relationPurposes = [
      ["topic_relation", "social_monitor.reader_summary.topic_map.verify_relations.v2"],
      ["story_relation", "social_monitor.reader_summary.verify_story_relations.v2"],
      ["related_topic_relation", "social_monitor.reader_summary.verify_related_topic_relations.v2"],
    ] as const;
    for (const [taskRole, purpose] of relationPurposes) {
      records.push({ ...structuredClone(records[1]!), taskRole,
        attestation: { ...records[1]!.attestation, requestId: `${taskRole}-request`, purpose } });
    }
    for (const record of records) {
      record.attestation.model = "mimo-v2.6-pro";
      record.attestation.runtimePackageVersion = "0.1.0-main.40-sm-mimo.3";
    }
    const violations: string[] = [];
    const provenance = runtimeProvenanceFromExecutorAttestations(evidenceWith(records), violations);
    expect(violations).toEqual([]);
    expect(provenance).toMatchObject({ physicalModel: "mimo-v2.6-pro",
      topicLabeler: { physicalModel: "mimo-v2.6-pro",
        runtimeVersion: "0.1.0-main.40-sm-mimo.3" } });
    expect(isCurrentProductionSubscriptionRuntimeProvenance(provenance)).toBe(true);

    records[0]!.attempt = "repair";
    records[0]!.attestation.purpose = "social_monitor.reader_summary.repair.v2";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(records), [])).not.toBeNull();

    records[2]!.attestation.purpose = "social_monitor.reader_summary.verify_story_relations.v2";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(records), [])).toBeNull();
  });

  it("accepts pinned MiMo generation with an independent Codex topic runtime identity", () => {
    const records = productionExecutionAttestations();
    records[0]!.attestation.model = "mimo-v2.6-pro";
    records[0]!.attestation.runtimePackageVersion = "0.1.0-main.40-sm-mimo.3";
    records[1]!.attestation.runtimePackageVersion = "0.1.0-main.42-sm.3";
    records.push({ ...structuredClone(records[1]!), taskRole: "topic_relation",
      attestation: { ...records[1]!.attestation, requestId: "topic-relation-request",
        purpose: "social_monitor.reader_summary.topic_map.verify_relations.v2" } });
    const violations: string[] = [];
    const provenance = runtimeProvenanceFromExecutorAttestations(evidenceWith(records), violations);
    expect(violations).toEqual([]);
    expect(provenance).toMatchObject({
      physicalModel: "mimo-v2.6-pro", runtimeVersion: "0.1.0-main.40-sm-mimo.3",
      topicLabeler: { physicalModel: "gpt-5.6-sol", runtimeVersion: "0.1.0-main.42-sm.3" },
    });
    expect(isCurrentProductionSubscriptionRuntimeProvenance(provenance)).toBe(true);
    if (provenance?.execution !== "attested") throw new Error("Synthetic attestation must execute");
    expect(isCurrentProductionSubscriptionRuntimeProvenance({ ...provenance,
      topicLabeler: { ...provenance.topicLabeler, runtimeVersion: "0.1.0-main.1" },
    })).toBe(false);

    records[2]!.attestation.runtimePackageVersion = "0.1.0-main.1";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(records), [])).toBeNull();
  });

  it("rejects unpinned MiMo package and cross-purpose model substitution", () => {
    const unpinned = productionExecutionAttestations();
    unpinned[0]!.attestation.model = "mimo-v2.6-pro";
    unpinned[0]!.attestation.runtimePackageVersion = "0.1.0-main.40-sm-mimo.3";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(unpinned), [])).toBeNull();

    const wrongRole = productionExecutionAttestations();
    wrongRole[1]!.attestation.model = "mimo-v2.6-pro";
    wrongRole[1]!.attestation.runtimePackageVersion = "0.1.0-main.40-sm-mimo.3";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(wrongRole), [])).toBeNull();
  });
});
