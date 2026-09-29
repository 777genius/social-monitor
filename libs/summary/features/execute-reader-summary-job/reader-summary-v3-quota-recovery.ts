/** A retry is safe only for a typed rejection at the writer boundary. */
export const retryableQuotaMarker = "v3_retryable_provider_rate_limited";
export const retryDelayMs = 60_000;

export const isDefinitiveQuotaRejection = (error: unknown): boolean => {
  if (error === null || typeof error !== "object" || !("failure" in error)) return false;
  const failure = error.failure;
  return failure !== null && typeof failure === "object" &&
    "kind" in failure && failure.kind === "provider_rate_limited" &&
    "retryable" in failure && failure.retryable === true;
};
