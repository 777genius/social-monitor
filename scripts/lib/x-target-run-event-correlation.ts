import type { XAccountUsageEventRow } from "./x-account-attribution-report";

export type XTargetRunEventCorrelation = {
  readonly status: "exact" | "ambiguous" | "unknown";
  readonly ambiguousEventCount: number;
};

export type XRunExecutionWindow = {
  readonly startedAt: number;
  readonly finishedAt: number;
};

export function correlateXAccountEventsToTargetRuns(params: {
  readonly events: readonly XAccountUsageEventRow[];
  readonly targetRunIds: readonly (string | null | undefined)[];
  readonly legacyWindows: readonly XRunExecutionWindow[];
}): {
  readonly rows: readonly XAccountUsageEventRow[];
  readonly correlation: XTargetRunEventCorrelation;
} {
  const targetRunIds = new Set(
    params.targetRunIds
      .map(normalizedIdentity)
      .filter((value): value is string => value !== undefined),
  );
  if (targetRunIds.size === 0) {
    return {
      rows: [],
      correlation: { status: "unknown", ambiguousEventCount: 0 },
    };
  }

  const anchors = params.events.filter((event) =>
    eventAnchorsTargetRun(event, targetRunIds),
  );
  const targetRequestKeys = new Set(
    anchors
      .map(eventRequestKey)
      .filter((value): value is string => value !== undefined),
  );
  const rows = params.events.filter((event) => {
    const explicitRunId = normalizedIdentity(event.collector_run_id);
    if (explicitRunId !== undefined && !targetRunIds.has(explicitRunId)) {
      return false;
    }
    const requestKey = eventRequestKey(event);
    return (
      eventAnchorsTargetRun(event, targetRunIds) ||
      (requestKey !== undefined && targetRequestKeys.has(requestKey))
    );
  });
  const included = new Set(rows);
  const ambiguousEventCount = params.events.filter((event) => {
    if (included.has(event) || !eventFallsInsideWindows(event, params.legacyWindows)) {
      return false;
    }
    const explicitRunId = normalizedIdentity(event.collector_run_id);
    return explicitRunId === undefined || targetRunIds.has(explicitRunId);
  }).length;

  return {
    rows,
    correlation: {
      status:
        ambiguousEventCount > 0
          ? "ambiguous"
          : rows.length > 0
            ? "exact"
            : "unknown",
      ambiguousEventCount,
    },
  };
}

function eventAnchorsTargetRun(
  event: XAccountUsageEventRow,
  targetRunIds: ReadonlySet<string>,
): boolean {
  if (eventRequestKey(event) === undefined) {
    return false;
  }
  const collectorRunId = normalizedIdentity(event.collector_run_id);
  if (collectorRunId !== undefined) {
    return targetRunIds.has(collectorRunId);
  }

  return [event.request_id, event.scan_job_id]
    .map(normalizedIdentity)
    .some((identity) => identity !== undefined && targetRunIds.has(identity));
}

function eventRequestKey(event: XAccountUsageEventRow): string | undefined {
  const requestId = normalizedIdentity(event.request_id);
  const scanJobId = normalizedIdentity(event.scan_job_id);
  return requestId === undefined || scanJobId === undefined
    ? undefined
    : `${requestId}\u0000${scanJobId}`;
}

function normalizedIdentity(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

function eventFallsInsideWindows(
  event: XAccountUsageEventRow,
  windows: readonly XRunExecutionWindow[],
): boolean {
  const occurredAt = parseTimestamp(event.occurred_at);
  return (
    occurredAt !== undefined &&
    windows.some(
      (window) =>
        window.startedAt <= occurredAt && occurredAt <= window.finishedAt,
    )
  );
}

function parseTimestamp(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}
