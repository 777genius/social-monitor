/** Explicit authorization for retained current metrics; never an original-day replay. */
export type RetainedPromotionAuthority = {
  readonly mode: "retained-current-authority";
  readonly projection: "feed-engagement-snapshot-and-last-two-observations-v1";
  readonly boundThrough: string;
  readonly bindings: readonly RetainedPromotionAuthorityBinding[];
};

export type RetainedPromotionAuthorityBinding = {
  readonly feedItemId: string;
  readonly authoritySha256: string;
  readonly cutoffAt: string | null;
};

export type RetainedPromotionCandidateAuthority = {
  readonly mode: RetainedPromotionAuthority["mode"];
  readonly projection: RetainedPromotionAuthority["projection"];
  readonly boundThrough: string;
  readonly authoritySha256: string;
  readonly cutoffAt: string;
};

/** Missing/mismatched authority has no fallback to wall-clock or another candidate. */
export const retainedPromotionCutoff = (
  authority: RetainedPromotionCandidateAuthority,
  metricObservedAt: string | undefined,
  ingestionCutoff: string,
): string | undefined => {
  if (authority.mode !== "retained-current-authority" ||
      authority.projection !== "feed-engagement-snapshot-and-last-two-observations-v1" ||
      !/^[0-9a-f]{64}$/u.test(authority.authoritySha256) ||
      !canonicalTimestamp(authority.cutoffAt) ||
      !canonicalTimestamp(authority.boundThrough) ||
      !canonicalTimestamp(ingestionCutoff) ||
      metricObservedAt !== new Date(authority.cutoffAt).toISOString() ||
      exactRetainedPromotionTimestamp(authority.cutoffAt) > exactRetainedPromotionTimestamp(authority.boundThrough) ||
      exactRetainedPromotionTimestamp(authority.boundThrough) > exactRetainedPromotionTimestamp(ingestionCutoff)) return undefined;
  // V2 uses millisecond Date projections; the bound raw observation and ordering
  // are checked at PostgreSQL microsecond precision before this projection.
  return new Date(authority.cutoffAt).toISOString();
};

const canonicalTimestamp = (value: string): boolean => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/u.test(value) &&
    new Date(parsed).toISOString() === value.replace(/(\.\d{3})\d{3}Z$/u, "$1Z");
};

export const exactRetainedPromotionTimestamp = (value: string): string =>
  value.replace(/\.(\d{3})Z$/u, ".$1" + "000Z");
