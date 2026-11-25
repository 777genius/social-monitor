import { workspaceId } from "@social-monitor/shared-kernel";
import { readerSummaryCommandIdentity } from "./agent-runtime-reader-summary-command-identity";
import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import {
  activeReaderSummaryPurposes,
  frozenLegacyReaderSummaryRecoveryContract,
} from "./reader-summary-runtime-contract";

describe("reader summary command identity", () => {
  it("keeps a stable correlation while primary, repair and frozen recovery keep distinct request identities", () => {
    const input = readerSummaryInput();
    const primary = readerSummaryCommandIdentity({ input, attempt: "primary", legacyRecovery: false });
    const repair = readerSummaryCommandIdentity({ input, attempt: "repair", legacyRecovery: false });
    const legacy = readerSummaryCommandIdentity({ input, attempt: "primary", legacyRecovery: true });
    const legacyRepair = readerSummaryCommandIdentity({ input, attempt: "repair", legacyRecovery: true });

    expect(primary.purpose).toBe(activeReaderSummaryPurposes.generate);
    expect(repair.purpose).toBe(activeReaderSummaryPurposes.repair);
    expect(legacy.purpose).toBe(frozenLegacyReaderSummaryRecoveryContract.purposes.generate);
    expect(legacyRepair.purpose).toBe(frozenLegacyReaderSummaryRecoveryContract.purposes.repair);
    expect(primary.requestId).not.toBe(repair.requestId);
    expect(primary.requestId).toBe(legacy.requestId);
    expect(repair.requestId).toBe(legacyRepair.requestId);
    expect(new Set([primary, repair, legacy, legacyRepair].map((value) => value.correlationId)).size).toBe(1);
    expect(readerSummaryCommandIdentity({ input, attempt: "primary", legacyRecovery: false })).toEqual(primary);
  });

  it("binds both identifiers to workspace and request time without mutating scoped input", () => {
    const input = readerSummaryInput();
    const originalDate = input.requestedAt.getTime();
    const first = readerSummaryCommandIdentity({ input, attempt: "primary", legacyRecovery: false });
    const differentScope = readerSummaryCommandIdentity({
      input: { ...input, workspaceId: workspaceId("isolated-workspace") },
      attempt: "primary",
      legacyRecovery: false,
    });
    const differentTime = readerSummaryCommandIdentity({
      input: { ...input, requestedAt: new Date(originalDate + 1_000) },
      attempt: "primary",
      legacyRecovery: false,
    });

    expect(differentScope.requestId).not.toBe(first.requestId);
    expect(differentScope.correlationId).not.toBe(first.correlationId);
    expect(differentTime.requestId).not.toBe(first.requestId);
    expect(differentTime.correlationId).not.toBe(first.correlationId);
    expect(input.requestedAt.getTime()).toBe(originalDate);
    expect(input.workspaceId).not.toBe(differentScope.correlationId);
  });
});
