/** Safe diagnostics for the operator-only successor fixture preparation command. */
export const successorFixtureUsage =
  "usage: prepare-reader-summary-successor-fixture.ts ADMIN_SOCKET_URL IMMUTABLE_MARKER NEW_OUTPUT_DIRECTORY";

const preparationReasons = {
  usage: successorFixtureUsage,
  marker: "Check the immutable regular marker file and matching disposable socket target.",
  output: "Use a new output directory under an existing real directory with write permission.",
  attestation: "Check socket connectivity, disposable cluster admin access, marker identity and exclusive empty fixture database.",
  provisioning: "Check fixture migration/bootstrap, observer provisioning and privilege audit requirements using the disposable cluster admin.",
  seed: "Check synthetic fixture seed prerequisites and fixture writer privileges.",
  runtime: "Check fixture runtime connections and pool configuration.",
  manifest: "Check seeded fixture authority, reconciliation and manifest validation invariants.",
  artifacts: "Check output directory permissions and exclusive artifact names; use a fresh fixture for retry.",
  receipt: "Check output directory permissions and exclusive receipt name; use a fresh fixture for retry.",
  cleanup: "Check fixture connection cleanup before retrying with a fresh fixture.",
} as const;

export type SuccessorPreparationPhase = keyof typeof preparationReasons;

const systemCodes = new Set([
  "EACCES", "EPERM", "ENOENT", "EEXIST", "ENOTDIR", "EISDIR", "ELOOP",
  "EROFS", "ENOSPC", "EDQUOT", "EMFILE", "ENFILE", "ENAMETOOLONG", "EIO",
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE",
]);

function preparationErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  // Never serialize an exception or consult message/stack/cause/SQL payloads.
  // A descriptor also avoids invoking an untrusted code getter.
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    const code: unknown = descriptor?.value;
    return typeof code === "string" && (/^[0-9A-Z]{5}$/u.test(code) || systemCodes.has(code))
      ? code : undefined;
  } catch { return undefined; }
}

export function successorPreparationFailure(phase: SuccessorPreparationPhase, error: unknown) {
  const code = preparationErrorCode(error);
  return {
    status: "failed" as const,
    synthetic: true,
    nativeGate: "not-run" as const,
    phase,
    ...(code === undefined ? {} : { code }),
    reason: phase === "provisioning" && code === "42501"
      ? "Fixture migration/observer provisioning or privilege audit was denied; check disposable admin/bootstrap grants."
      : preparationReasons[phase],
  };
}
