/**
 * Identity of the vendored account-gateway SDK that executes gateway-llm
 * tasks. It is the gateway counterpart of the CLI runtime version and
 * launcher digest: attestations, runtime health and publication verifiers
 * bind to these two values. Keep them aligned with
 * vendor/account-gateway/*.provenance.json;
 * scripts/lib/reader-summary-publication-runtime-policy.test.mjs checks the
 * digest against the vendored archive and the lockfile.
 */
export type GatewayLlmSdkIdentity = {
  readonly packageVersion: string;
  readonly archiveSha256: string;
};

export const approvedGatewayLlmSdkIdentity: GatewayLlmSdkIdentity = Object.freeze({
  packageVersion: "0.1.0-llm.0f3827f",
  archiveSha256:
    "5b1ec4ee7d17bfe5a6871e51598a040192dd69f539a0966eb9112e12b2c1694e",
});

export const approvedGatewayLlmSdkArchivePath =
  "vendor/account-gateway/agent-teams-account-gateway-0.1.0-llm-0f3827f.tgz";
