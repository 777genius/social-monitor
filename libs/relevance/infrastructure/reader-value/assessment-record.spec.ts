import { assessmentFromRecord, type AssessmentRecord } from "./assessment-record";

describe("assessment persistence timestamp boundary", () => {
  it("canonicalizes DB-shaped assessment timestamps with exact microseconds", () => {
    const assessment = assessmentFromRecord(record());

    expect(assessment.leaseUntil).toBe("2026-09-20T00:09:00.123400Z");
    expect(assessment.assessedAt).toBe("2026-09-20T00:10:00.000001Z");
  });
});

const record = (): AssessmentRecord => ({
  id: "00000000-0000-4000-8000-000000000001",
  tenant_id: "00000000-0000-4000-8000-000000000002",
  workspace_id: "00000000-0000-4000-8000-000000000003",
  interest_id: "00000000-0000-4000-8000-000000000004",
  source_item_id: "00000000-0000-4000-8000-000000000005",
  source_revision_key: "revision", source_snapshot_sha256: "1".repeat(64),
  interest_sha256: "2".repeat(64), rubric_version: "reader-value.v1",
  rubric_sha256: "3".repeat(64), input_builder_version: "input.v1",
  model_config_version: "jev.v1", input_sha256: "4".repeat(64),
  request_sha256: "5".repeat(64), requested_model: "jev", request_body: "{}",
  input_snapshot: {} as AssessmentRecord["input_snapshot"], state: "pending",
  attempts: 1, lease_token: "00000000-0000-4000-8000-000000000006",
  lease_until: "2026-09-20 00:09:00.1234+00",
  assessed_at: "2026-09-20 00:10:00.000001+00:00", result: null,
  error_code: null, usage_unknown: true, cost_usd: null,
});
