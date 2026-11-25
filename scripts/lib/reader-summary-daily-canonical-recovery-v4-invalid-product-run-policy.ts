import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports";

import type {
  CanonicalRecoveryPublication,
  CanonicalRecoveryUnavailable,
} from "./reader-summary-daily-canonical-recovery-v4";
import type { ReaderSummaryDailyCanonicalRecoveryV4Executor } from "./reader-summary-daily-canonical-recovery-v4-executor";
import {
  invalidProductRetryDates,
  type InvalidProductRetrySetAuthorizer,
} from "./reader-summary-daily-canonical-recovery-v4-invalid-product-retry-set";
import {
  readerSummaryDailyTerminalSetReceiptTenantId,
  readerSummaryDailyTerminalSetReceiptWorkspaceId,
} from "./reader-summary-daily-terminal-set-receipt";
import { probeProductionRuntimeLiveIdentity } from "./reader-summary-runtime-live-identity";

type InvalidProductExecutor = Pick<
  ReaderSummaryDailyCanonicalRecoveryV4Executor,
  "runOne"
>;

type InvalidProductCaughtUp = Readonly<{
  kind: "caught_up";
  publications: readonly CanonicalRecoveryPublication[];
  unavailable: readonly CanonicalRecoveryUnavailable[];
}>;

/**
 * Runs the closed Jul25--Jul30 retry set without inheriting runAll's ordinary
 * unavailable-skipping behavior. The live identity check and DB authorization
 * are deliberately adjacent to close the runtime/authorization TOCTOU window.
 */
export const runReaderSummaryDailyCanonicalRecoveryV4InvalidProduct = async (
  input: Readonly<{
    tenantId: string;
    workspaceId: string;
    workerId: string;
    terminalSetSha256: string;
    runtimeServiceToken: string;
    runtimeClient: Pick<AgentRuntimeClientPort, "checkHealth">;
    authorizer: InvalidProductRetrySetAuthorizer;
    executor: InvalidProductExecutor;
    now: () => Date;
  }>,
): Promise<InvalidProductCaughtUp> => {
  assertInvalidProductRunPreconditions(input);
  await probeProductionRuntimeLiveIdentity({
    client: input.runtimeClient,
    checkedAt: input.now().toISOString(),
  });
  const authorization = await input.authorizer.authorize({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    terminalSetSha256: input.terminalSetSha256,
  });
  assertExactAuthorizationCoverage(authorization);

  const resolved = new Set<string>();
  for (let index = 0; index < invalidProductRetryDates.length + 1; index += 1) {
    const outcome = await input.executor.runOne({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      workerId: input.workerId,
    });
    if (outcome.kind === "caught_up") {
      assertExactFinalizedTargetSet(outcome);
      return outcome;
    }
    if (outcome.kind === "leased") {
      throw new Error(
        `Daily canonical recovery invalid-product retry is leased at ${outcome.requestedUtcDate}`,
      );
    }
    if (outcome.kind === "failed_ambiguous") {
      throw new Error(
        `Daily canonical recovery invalid-product retry is unavailable at ${outcome.requestedUtcDate}`,
      );
    }
    const requestedUtcDate = outcome.publication.requestedUtcDate;
    if (
      !(invalidProductRetryDates as readonly string[]).includes(
        requestedUtcDate,
      ) ||
      resolved.has(requestedUtcDate)
    ) {
      throw new Error(
        "Daily canonical recovery invalid-product retry result set is invalid",
      );
    }
    resolved.add(requestedUtcDate);
  }
  throw new Error(
    "Daily canonical recovery invalid-product retry did not catch up exactly",
  );
};

export const assertExactFinalizedTargetSet = (
  outcome: InvalidProductCaughtUp,
): void => {
  const targetDates = new Set<string>(invalidProductRetryDates);
  const targetUnavailable = outcome.unavailable.filter((entry) =>
    targetDates.has(entry.requestedUtcDate),
  );
  if (targetUnavailable.length > 0) {
    throw new Error(
      `Daily canonical recovery invalid-product target is unavailable at ${targetUnavailable[0]!.requestedUtcDate}`,
    );
  }
  const finalizedDates = outcome.publications
    .map((entry) => entry.requestedUtcDate)
    .filter((date) => targetDates.has(date))
    .sort();
  if (
    new Set(finalizedDates).size !== invalidProductRetryDates.length ||
    JSON.stringify(finalizedDates) !== JSON.stringify(invalidProductRetryDates)
  ) {
    throw new Error(
      "Daily canonical recovery invalid-product finalized target set is invalid",
    );
  }
  const allowedDates = new Set([
    "2026-07-23",
    "2026-07-24",
    ...invalidProductRetryDates,
  ]);
  const allDates = [
    ...outcome.publications.map((entry) => entry.requestedUtcDate),
    ...outcome.unavailable.map((entry) => entry.requestedUtcDate),
  ];
  if (
    allDates.some((date) => !allowedDates.has(date)) ||
    new Set(allDates).size !== allDates.length
  ) {
    throw new Error(
      "Daily canonical recovery invalid-product terminal set is widened or duplicated",
    );
  }
};

const assertInvalidProductRunPreconditions = (
  input: Readonly<{
    tenantId: string;
    workspaceId: string;
    workerId: string;
    terminalSetSha256: string;
    runtimeServiceToken: string;
  }>,
): void => {
  if (
    input.tenantId !== readerSummaryDailyTerminalSetReceiptTenantId ||
    input.workspaceId !== readerSummaryDailyTerminalSetReceiptWorkspaceId ||
    input.workerId.trim().length === 0 ||
    !/^[0-9a-f]{64}$/u.test(input.terminalSetSha256) ||
    input.runtimeServiceToken.trim().length === 0
  ) {
    throw new Error(
      "Daily canonical recovery invalid-product run precondition is invalid",
    );
  }
};

const assertExactAuthorizationCoverage = (
  authorization: readonly Readonly<{
    requestedUtcDate: string;
    modelJobIdentity: string;
    authorizationSha256: string;
  }>[],
): void => {
  if (
    authorization.length !== invalidProductRetryDates.length ||
    authorization.some(
      (entry, index) =>
        entry.requestedUtcDate !== invalidProductRetryDates[index] ||
        !/^[0-9a-f]{64}$/u.test(entry.modelJobIdentity) ||
        !/^[0-9a-f]{64}$/u.test(entry.authorizationSha256),
    )
  ) {
    throw new Error(
      "Daily canonical recovery invalid-product authorization is invalid",
    );
  }
};
