// Detached planning vocabulary. This is not an admission or send-policy ABI.
export type PlanningFailureCode = "MISSING_INPUT" | "SOURCE_PIN_MISMATCH" | "INVALID_SCOPE_OR_WINDOW" |
  "QUERY_LOSS_OR_OVERFLOW" | "PARSER_OR_PLANNER_MISMATCH" | "SDK_EXPANSION_MISMATCH" |
  "UNSUPPORTED_PROFILE" | "DUPLICATE_COORDINATE" | "BOUNDS_OVERFLOW" | "UNAPPROVED_AMENDMENT";
export type PlanningFailure = Readonly<{ code: PlanningFailureCode; path: string }>;
export type PlanningResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: PlanningFailure };
export type PlanJson = null | boolean | number | string | readonly PlanJson[] | { readonly [key: string]: PlanJson };
export type PlanRecord = { readonly [key: string]: PlanJson };
export type PlanDigest = (value: unknown) => string;
export type CanonicalStream = Readonly<{
  streamId: string; passId: string; splitOrdinal: number; splitWindow: { since: string; until: string };
  rawQuery: string; rawQueryHash: string; normalizedRequestHash: string;
  parametersWithoutCursor: Readonly<Record<string, string>>; parametersHash: string;
  publicUrl: string; profileHash: string; product: "Top" | "Latest"; pageLimit: 5;
}>;
export type CanonicalPass = Readonly<{
  passId: string; ordinal: number; label: string; product: "top" | "latest"; limit: number;
  minLikes: number | null; minRetweets: number | null; minReplies: number | null;
  globalStopScope: string; stopRuleSourceHash: string; budgetSelectionSourceHash: string;
  streams: readonly CanonicalStream[];
}>;
export type CanonicalInvocation = Readonly<{
  invocationId: string; laneId: string; ordinal: 0; requestHash: string; request: PlanRecord;
  continuationPolicy: "canonical-no-external-cursor-at-source-pin"; passes: readonly CanonicalPass[];
}>;
export type CanonicalLane = Readonly<{
  day: string; laneOrdinal: number; laneId: string; searchQuery: string; budget: number; target: number;
  predicate: PlanRecord; request: PlanRecord; invocationIds: readonly string[];
}>;
export type RetainedDescriptor = Readonly<{ day: string; streamId: string; pageLimit: 5; descriptorHash: string }>;
export type ProposedBounds = Readonly<{
  amendmentId: string; compilerManifestHash: string;
  days: readonly Readonly<{ day: string; K: number; R: number; sendLimit: number }>[]; totalSendLimit: number;
  pageLimit: 5; count: 20; bootstrap: 6; redirects: 2; requestMs: 10000;
  candidateDay: 800; candidateTotal: 5600; dayMs: 600000; totalMs: 4200000;
}>;
export type ResolvedCanonicalPolicyV1 = Readonly<{
  version: 1; leaves: readonly Readonly<{ laneId: string; predicate: PlanRecord }>[];
  compilerManifestHash: string; rankingHash: string; boundsHash: string;
}>;

export function proposedSendLimit(K: number, R: number): PlanningResult<number> {
  const value = 6 + 5 * (K + R);
  return [K, R, value].every((n) => Number.isSafeInteger(n) && n >= 0) ? { ok: true, value } : failure("BOUNDS_OVERFLOW", "bounds.sendLimit");
}

export function proposedBounds(days: readonly string[], invocations: readonly CanonicalInvocation[],
  retained: readonly RetainedDescriptor[], amendmentId: string, compilerManifestHash: string): PlanningResult<ProposedBounds> {
  if (!amendmentId.trim()) return failure("UNAPPROVED_AMENDMENT", "amendmentId");
  if (days.length !== 7 || new Set(days).size !== 7) return failure("INVALID_SCOPE_OR_WINDOW", "days");
  const coordinates = new Set<string>(), counts = new Map(days.map((day) => [day, { K: 0, R: 0 }]));
  for (const invocation of invocations) {
    if (invocation.ordinal !== 0 || invocation.invocationId !== `${invocation.laneId}/i0`) return failure("DUPLICATE_COORDINATE", "invocations");
    const day = invocation.invocationId.slice(0, 10), count = counts.get(day);
    if (!count || !invocation.passes.length) return failure("SDK_EXPANSION_MISMATCH", "invocations");
    for (const [ordinal, pass] of invocation.passes.entries()) {
      if (pass.passId !== `${invocation.invocationId}/p${ordinal}` || pass.ordinal !== ordinal ||
          pass.globalStopScope !== pass.passId || !pass.streams.length) return failure("DUPLICATE_COORDINATE", "passes");
      for (const [split, stream] of pass.streams.entries()) {
        if (stream.streamId !== `${pass.passId}/s${split}` || stream.passId !== pass.passId ||
            stream.splitOrdinal !== split || coordinates.has(stream.streamId)) return failure("DUPLICATE_COORDINATE", "streams");
        if (stream.pageLimit !== 5) return failure("SDK_EXPANSION_MISMATCH", "streams.pageLimit");
        coordinates.add(stream.streamId); count.K += 1;
      }
    }
  }
  for (const descriptor of retained) {
    const count = counts.get(descriptor.day);
    if (!count || descriptor.pageLimit !== 5 || !descriptor.streamId.trim() || !/^[a-f0-9]{64}$/u.test(descriptor.descriptorHash)) {
      return failure("INVALID_SCOPE_OR_WINDOW", "retained");
    }
    if (coordinates.has(descriptor.streamId)) return failure("DUPLICATE_COORDINATE", "retained.streamId");
    coordinates.add(descriptor.streamId); count.R += 1;
  }
  const limits = days.map((day) => {
    const { K, R } = counts.get(day)!;
    const limit = proposedSendLimit(K, R);
    return { day, K, R, sendLimit: limit.ok ? limit.value : NaN };
  });
  const totalSendLimit = limits.reduce((sum, day) => sum + day.sendLimit, 0);
  if (!limits.every((day) => Number.isSafeInteger(day.sendLimit)) || !Number.isSafeInteger(totalSendLimit)) {
    return failure("BOUNDS_OVERFLOW", "bounds");
  }
  return { ok: true, value: { amendmentId, compilerManifestHash, days: limits, totalSendLimit,
    pageLimit: 5, count: 20, bootstrap: 6, redirects: 2, requestMs: 10000,
    candidateDay: 800, candidateTotal: 5600, dayMs: 600000, totalMs: 4200000 } };
}

export function failure(code: PlanningFailureCode, path: string): { readonly ok: false; readonly error: PlanningFailure } {
  return { ok: false, error: { code, path } };
}
