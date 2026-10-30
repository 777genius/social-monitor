/**
 * Identity of the vendored account-gateway SDK that executes gateway-llm
 * tasks. It is the gateway counterpart of the CLI runtime version and
 * launcher digest: attestations, runtime health and publication verifiers
 * bind to these two values. Keep them aligned with
 * vendor/account-gateway/*.provenance.json and the standalone publication
 * verifier in scripts/lib/reader-summary-publication-runtime-policy.mjs.
 */
export type GatewayLlmSdkIdentity = {
  readonly packageVersion: string;
  readonly archiveSha256: string;
};

export const approvedGatewayLlmSdkIdentity: GatewayLlmSdkIdentity = Object.freeze({
  packageVersion: "0.1.0-llm.e22c720",
  archiveSha256:
    "de1c3aa1681e2f970637edc81ed85745b392d554603a4d60b333509d71c4835a",
});

export const approvedGatewayLlmSdkArchivePath =
  "vendor/account-gateway/agent-teams-account-gateway-0.1.0-llm-e22c720.tgz";
