import { createHash } from "node:crypto";

import { ReaderSummaryPolicy } from "@social-monitor/summary/domain";
import type { ReaderSummaryPolicyRepositoryPort } from
  "@social-monitor/summary/ports";
import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export const ensureReaderSummaryProductionDayPolicy = async (input: {
  repository: ReaderSummaryPolicyRepositoryPort;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  maxStories: number;
  now: Date;
}): Promise<void> => input.repository.save(ReaderSummaryPolicy.create({
  id: deterministicUuid([
    "reader-summary-policy", input.tenantId, input.workspaceId, "workspace",
  ].join(":")),
  tenantId: input.tenantId,
  workspaceId: input.workspaceId,
  scope: { type: "workspace" },
  language: "auto",
  format: "executive_brief",
  tone: "analytical",
  maxStories: input.maxStories,
  includeRisks: true,
  includeInterestHighlights: true,
  includeRepeatedSignals: true,
  dedupeStrategy: "canonical_url_then_title",
  customInstructions:
    "Build a practical daily reader summary for AI/product/social monitoring. Prefer fresh, cited, high-signal items and clearly separate facts from risks.",
  createdAt: input.now,
  updatedAt: input.now,
}));

const deterministicUuid = (value: string): string => {
  const bytes = Buffer.from(createHash("sha256").update(value).digest())
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20),
  ].join("-");
};
