import { approvedSubscriptionRuntimeLauncherSha256 } from "../../apps/agent-runtime/src/subscription-runtime-installation";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import {
  isCurrentProductionSubscriptionRuntimeProvenance,
  runtimeProvenanceFromExecutorAttestations,
} from "./reader-summary-production-day-attestation";
import { productionExecutionAttestations } from "./reader-summary-production-day-attestation.spec-support";
import { approvedGatewayLlmSdkIdentity } from "@social-monitor/summary/adapters/model/gateway-llm/gateway-llm-sdk-identity";

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
    for (const record of records) record.attestation.launcherSha256 = approvedSubscriptionRuntimeLauncherSha256;
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
      record.attestation.runtimePackageVersion = "0.1.0-main.40-sm-mimo.12";
    }
    const violations: string[] = [];
    const provenance = runtimeProvenanceFromExecutorAttestations(evidenceWith(records), violations);
    expect(violations).toEqual([]);
    expect(provenance).toMatchObject({ physicalModel: "mimo-v2.6-pro",
      topicLabeler: { physicalModel: "mimo-v2.6-pro",
        runtimeVersion: "0.1.0-main.40-sm-mimo.12" } });
    expect(isCurrentProductionSubscriptionRuntimeProvenance(provenance)).toBe(true);

    records[0]!.attempt = "repair";
    records[0]!.attestation.purpose = "social_monitor.reader_summary.repair.v2";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(records), [])).not.toBeNull();

    records[2]!.attestation.purpose = "social_monitor.reader_summary.verify_story_relations.v2";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(records), [])).toBeNull();
  });

  it("accepts pinned MiMo generation with an independent Codex topic runtime identity", () => {
    const records = productionExecutionAttestations();
    for (const record of records) record.attestation.launcherSha256 = approvedSubscriptionRuntimeLauncherSha256;
    records[0]!.attestation.model = "mimo-v2.6-pro";
    records[0]!.attestation.runtimePackageVersion = "0.1.0-main.40-sm-mimo.12";
    records[1]!.attestation.runtimePackageVersion = "0.1.0-main.42-sm.3";
    records.push({ ...structuredClone(records[1]!), taskRole: "topic_relation",
      attestation: { ...records[1]!.attestation, requestId: "topic-relation-request",
        purpose: "social_monitor.reader_summary.topic_map.verify_relations.v2" } });
    const violations: string[] = [];
    const provenance = runtimeProvenanceFromExecutorAttestations(evidenceWith(records), violations);
    expect(violations).toEqual([]);
    expect(provenance).toMatchObject({
      physicalModel: "mimo-v2.6-pro", runtimeVersion: "0.1.0-main.40-sm-mimo.12",
      topicLabeler: { physicalModel: "gpt-5.6-sol", runtimeVersion: "0.1.0-main.42-sm.3" },
    });
    expect(isCurrentProductionSubscriptionRuntimeProvenance(provenance)).toBe(true);
    if (provenance?.execution !== "attested") throw new Error("Synthetic attestation must execute");
    expect(isCurrentProductionSubscriptionRuntimeProvenance({ ...provenance,
      topicLabeler: { ...provenance.topicLabeler, runtimeVersion: "0.1.0-main.1" },
    })).toBe(false);

    records[2]!.attestation.runtimePackageVersion = "0.1.0-main.1";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(records), [])).toBeNull();

    const legacyTopic = productionExecutionAttestations();
    for (const record of legacyTopic) record.attestation.launcherSha256 = approvedSubscriptionRuntimeLauncherSha256;
    legacyTopic[0]!.attestation.model = "mimo-v2.6-pro";
    legacyTopic[0]!.attestation.runtimePackageVersion = "0.1.0-main.40-sm-mimo.12";
    legacyTopic[1]!.attestation.runtimePackageVersion = "0.1.0-main.42-sm.3";
    legacyTopic[1]!.attestation.purpose = "social_monitor.reader_summary.topic_map.label";
    legacyTopic[1]!.attestation.reasoningEffort = "xhigh";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(legacyTopic), []))
      .toBeNull();
  });

  it("rejects unpinned MiMo package and cross-purpose model substitution", () => {
    const unpinned = productionExecutionAttestations();
    for (const record of unpinned) record.attestation.launcherSha256 = approvedSubscriptionRuntimeLauncherSha256;
    unpinned[1]!.attestation.runtimePackageVersion = "0.1.0-main.42-sm.3";
    unpinned[0]!.attestation.model = "mimo-v2.6-pro";
    unpinned[0]!.attestation.runtimePackageVersion = "0.1.0-main.40-sm-mimo.7";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(unpinned), [])).toBeNull();

    const wrongRole = productionExecutionAttestations();
    for (const record of wrongRole) {
      record.attestation.runtimePackageVersion = "0.1.0-main.42-sm.3";
      record.attestation.launcherSha256 = approvedSubscriptionRuntimeLauncherSha256;
    }
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(wrongRole), [])).not.toBeNull();
    wrongRole[1]!.attestation.model = "mimo-v2.6-pro";
    wrongRole[1]!.attestation.runtimePackageVersion = "0.1.0-main.40-sm-mimo.12";
    wrongRole[1]!.attestation.launcherSha256 = approvedSubscriptionRuntimeLauncherSha256;
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(wrongRole), [])).toBeNull();
  });

  it("binds a gateway-executed day to one gateway identity", () => {
    const gatewayRecords = () => productionExecutionAttestations().map((record, index) => ({
      ...record,
      attestation: { ...record.attestation, runtimeEngine: "gateway-llm",
        runtimePackageVersion: approvedGatewayLlmSdkIdentity.packageVersion,
        launcherSha256: approvedGatewayLlmSdkIdentity.archiveSha256,
        gateway: { profileId: "openai-codex-oauth-responses-v1", taskId: `smTask${index}`,
          attempt: 1, executionRef: `execution-${index}`, requestRef: `smTask${index}-a1-r`,
          accountRef: "00000000-0000-4000-8000-00000000000a", observedModel: null,
          requestSha256: "f".repeat(64) } },
    }));
    const violations: string[] = [];
    const provenance = runtimeProvenanceFromExecutorAttestations(
      evidenceWith(gatewayRecords()), violations);
    expect(violations).toEqual([]);
    expect(provenance).toMatchObject({ runtime: "gateway-llm",
      runtimeVersion: approvedGatewayLlmSdkIdentity.packageVersion,
      topicLabeler: { runtime: "gateway-llm" } });
    expect(isCurrentProductionSubscriptionRuntimeProvenance(provenance)).toBe(true);

    const mixed = gatewayRecords();
    mixed[1] = productionExecutionAttestations()[1]! as unknown as (typeof mixed)[number];
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(mixed), [])).toBeNull();
    const unbound = gatewayRecords();
    delete (unbound[0]!.attestation as { gateway?: unknown }).gateway;
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(unbound), [])).toBeNull();
    const mimo = gatewayRecords();
    for (const record of mimo) record.attestation.model = "mimo-v2.6-pro";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(mimo), [])).toBeNull();
  });

  it("accepts a gateway-only Kimi day with the route effort and nothing else", () => {
    const kimiRecords = () => productionExecutionAttestations().map((record, index) => ({
      ...record,
      attestation: { ...record.attestation, model: "k3-256k", reasoningEffort: "default",
        runtimeEngine: "gateway-llm",
        runtimePackageVersion: approvedGatewayLlmSdkIdentity.packageVersion,
        launcherSha256: approvedGatewayLlmSdkIdentity.archiveSha256,
        gateway: { profileId: "kimi-code-global-responses-apikey-v1", taskId: `smTask${index}`,
          attempt: 1, executionRef: `execution-${index}`, requestRef: `smTask${index}-a1-r`,
          accountRef: "43f64796-ec10-4a68-9256-6df3ac5183e4", observedModel: "k3-256k",
          requestSha256: "f".repeat(64) } },
    }));
    const violations: string[] = [];
    const provenance = runtimeProvenanceFromExecutorAttestations(
      evidenceWith(kimiRecords()), violations);
    expect(violations).toEqual([]);
    expect(provenance).toMatchObject({ physicalModel: "k3-256k", reasoningEffort: "default",
      runtime: "gateway-llm", topicLabeler: { physicalModel: "k3-256k", reasoningEffort: "default" } });
    expect(isCurrentProductionSubscriptionRuntimeProvenance(provenance)).toBe(true);

    // The CLI runtime never executes a gateway-only model.
    const cli = kimiRecords();
    for (const record of cli) {
      Object.assign(record.attestation, { runtimeEngine: "subscription-runtime-cli",
        runtimePackageVersion: "0.1.0-main.42-sm.3",
        launcherSha256: approvedSubscriptionRuntimeLauncherSha256 });
      delete (record.attestation as { gateway?: unknown }).gateway;
    }
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(cli), [])).toBeNull();
    // A different model or effort on one task breaks the one-identity day.
    const mixedModel = kimiRecords();
    mixedModel[1]!.attestation.model = "openai/gpt-oss-120b";
    Object.assign(mixedModel[1]!.attestation.gateway, { observedModel: null });
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(mixedModel), [])).toBeNull();
    const unknownEffort = kimiRecords();
    for (const record of unknownEffort) record.attestation.reasoningEffort = "none";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(unknownEffort), [])).toBeNull();
    const legacyPurpose = kimiRecords();
    legacyPurpose[1]!.attestation.purpose = "social_monitor.reader_summary.topic_map.label";
    expect(runtimeProvenanceFromExecutorAttestations(evidenceWith(legacyPurpose), [])).toBeNull();
  });
});
