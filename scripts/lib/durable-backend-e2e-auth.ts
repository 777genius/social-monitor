import { createPrivateKey, randomUUID, sign as signJwt } from "node:crypto";
import type { RunnerConfig } from "./durable-backend-e2e-config";
import type { JsonRecord } from "./durable-backend-e2e-json-fields";

export type AuthContext = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly token: string;
};

export function resolveAccessToken(
  runnerConfig: RunnerConfig,
  runtimeIds: Readonly<{ userId: string; tenantId: string; workspaceId: string }>,
): string {
  if (runnerConfig.accessToken !== undefined) {
    return runnerConfig.accessToken;
  }
  if (
    runnerConfig.privateKeyPem === undefined ||
    runnerConfig.keyId === undefined
  ) {
    throw new Error(
      "DURABLE_BACKEND_E2E_PRIVATE_KEY_PEM and DURABLE_BACKEND_E2E_JWT_KID are required when no access token is supplied",
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const privateKey = createPrivateKey(runnerConfig.privateKeyPem);
  const encodedHeader = encodeJson({
    alg: "RS256",
    typ: "JWT",
    kid: runnerConfig.keyId,
  });
  const encodedPayload = encodeJson({
    sub: runtimeIds.userId,
    iss: runnerConfig.issuer,
    aud: runnerConfig.audience,
    iat: nowSeconds,
    exp: nowSeconds + runnerConfig.accessTokenTtlSeconds,
    tenant_id: runtimeIds.tenantId,
    workspace_id: runtimeIds.workspaceId,
    workspace_roles: ["owner"],
  });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signJwt(
    "RSA-SHA256",
    Buffer.from(signingInput, "ascii"),
    privateKey,
  ).toString("base64url");

  return `${signingInput}.${signature}`;
}

export function authHeaders(auth: AuthContext): Record<string, string> {
  return {
    "x-tenant-id": auth.tenantId,
    "x-workspace-id": auth.workspaceId,
    authorization: `Bearer ${auth.token}`,
    "x-request-id": `durable-backend-loop-${randomUUID()}`,
  };
}

export function withIdempotency(
  headers: Readonly<Record<string, string>>,
  key: string,
): Record<string, string> {
  return {
    ...headers,
    "idempotency-key": key,
  };
}

function encodeJson(value: JsonRecord): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

