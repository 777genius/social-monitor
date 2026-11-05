import { guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { refreshModelCommand } from "./reader-summary-new-input-refresh-model.spec-support";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";
import { RefreshRuntimeAssertionFailure } from "./reader-summary-new-input-refresh-runtime-assertion";
import { sourceContentAssessmentPurpose } from "./reader-summary-new-input-refresh-assessment-runtime";

it.each(["local", "assessment_budget", "request_admission", "runtime_health", "runtime_mismatch",
  "current_authority", "journal_consumption"] as const)("records only the sanitized %s failure stage", async (stage) => {
  const diagnostic = "synthetic private exception text";
  const fail = () => { throw new Error(diagnostic); };
  const runTask = jest.fn();
  const captured: unknown[] = [], journal: unknown[] = [];
  const runtime = guardedRefreshRuntime({ manifest: refreshManifest(), delegate: { runTask, checkHealth: jest.fn() },
    assertLocal: stage === "local" ? fail : () => undefined,
    assertCurrent: async () => {
      if (stage === "runtime_health" || stage === "runtime_mismatch") throw new RefreshRuntimeAssertionFailure(stage);
      if (stage === "current_authority") fail();
    },
    capture: (event) => captured.push(event), record: (event) => {
      if (stage === "journal_consumption" && (event as { status?: string }).status === "invocation_consumed") fail();
      journal.push(event);
    } });
  const command = refreshModelCommand(stage === "assessment_budget" ? sourceContentAssessmentPurpose : undefined);
  // Invalid assessment JSON fails budget admission; conflicting metadata fails the
  // canonical runtime admission while leaving the outer scope/model gates valid.
  if (stage === "request_admission") Object.assign(command, { metadata: { ...command.metadata, model: "synthetic-wrong-model" } });
  await expect(runtime.runTask(command)).rejects.toThrow(/original operation remains consumed/);
  expect(runTask).not.toHaveBeenCalled();
  expect(captured.at(-1)).toMatchObject({ kind: "invocation_failed", delegated: false, preDelegationFailureStage: stage });
  expect(journal.at(-1)).toMatchObject({ status: "requires_reconciliation", delegated: false, preDelegationFailureStage: stage });
  expect(journal.some((event) => (event as { status?: string }).status === "invocation_consumed")).toBe(false);
  expect(JSON.stringify({ captured, journal })).not.toContain(diagnostic);
});
