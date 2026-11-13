import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { authHeaders, resolveAccessToken, withIdempotency } from "./durable-backend-e2e-auth.ts";

const ids = { userId: "user-fixture", tenantId: "tenant-fixture", workspaceId: "workspace-fixture" };

function signingFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    config: {
      accessToken: undefined,
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
      keyId: "fixture-key-id",
      issuer: "https://issuer.example.test",
      audience: "durable-test-audience",
      accessTokenTtlSeconds: 900,
    },
    publicKey,
  };
}

test("supplied access token passes through unchanged without requiring signing keys", () => {
  const token = "opaque-fixture-value";
  const value = resolveAccessToken({
    accessToken: token, privateKeyPem: undefined, keyId: undefined,
    issuer: "", audience: "", accessTokenTtlSeconds: 900,
  }, ids);
  assert.equal(value, token);
});

test("missing PEM or key ID remains fail-closed with the original diagnostic", () => {
  const { config } = signingFixture();
  const error = /DURABLE_BACKEND_E2E_PRIVATE_KEY_PEM and DURABLE_BACKEND_E2E_JWT_KID are required when no access token is supplied/;
  assert.throws(() => resolveAccessToken({ ...config, privateKeyPem: undefined }, ids), error);
  assert.throws(() => resolveAccessToken({ ...config, keyId: undefined }, ids), error);
});

test("generated RS256 JWT retains header, issuer, audience, identity, TTL, and valid signature", () => {
  const { config, publicKey } = signingFixture();
  const before = Math.floor(Date.now() / 1000);
  const signed = resolveAccessToken(config, ids);
  const after = Math.floor(Date.now() / 1000);
  const pieces = signed.split(".");
  assert.equal(pieces.length, 3);
  const [header, payload, signature] = pieces;
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString("utf8")), {
    alg: "RS256", typ: "JWT", kid: config.keyId,
  });
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.equal(claims.sub, ids.userId);
  assert.equal(claims.iss, config.issuer);
  assert.equal(claims.aud, config.audience);
  assert.equal(claims.tenant_id, ids.tenantId);
  assert.equal(claims.workspace_id, ids.workspaceId);
  assert.deepEqual(claims.workspace_roles, ["owner"]);
  assert.ok(claims.iat >= before && claims.iat <= after);
  assert.equal(claims.exp - claims.iat, config.accessTokenTtlSeconds);
  const signingInput = header + "." + payload;
  assert.equal(verify("RSA-SHA256", Buffer.from(signingInput, "ascii"), publicKey, Buffer.from(signature, "base64url")), true);
  const tampered = Buffer.from(JSON.stringify({ ...claims, tenant_id: "other-tenant" })).toString("base64url");
  assert.equal(verify("RSA-SHA256", Buffer.from(header + "." + tampered, "ascii"), publicKey, Buffer.from(signature, "base64url")), false);
});

test("invalid signing material fails closed rather than silently emitting a JWT", () => {
  const { config } = signingFixture();
  assert.throws(() => resolveAccessToken({ ...config, privateKeyPem: "not-a-private-key" }, ids));
});

test("auth headers preserve scope and token and create distinct request IDs", () => {
  const auth = { tenantId: "tenant-fixture", workspaceId: "workspace-fixture", token: "opaque-fixture-value" };
  const a = authHeaders(auth);
  const b = authHeaders(auth);
  assert.equal(a["x-tenant-id"], auth.tenantId);
  assert.equal(a["x-workspace-id"], auth.workspaceId);
  assert.equal(a.authorization, "Bearer " + auth.token);
  assert.match(a["x-request-id"], /^durable-backend-loop-[0-9a-f-]{36}$/);
  assert.notEqual(a["x-request-id"], b["x-request-id"]);
  assert.deepEqual(auth, { tenantId: "tenant-fixture", workspaceId: "workspace-fixture", token: "opaque-fixture-value" });
});

test("idempotency header returns a new object and overrides only the idempotency key", () => {
  const original = { "x-tenant-id": "tenant", "idempotency-key": "old", authorization: "Bearer fixture" };
  const value = withIdempotency(original, "updated");
  assert.deepEqual(value, { ...original, "idempotency-key": "updated" });
  assert.equal(original["idempotency-key"], "old");
  assert.notEqual(value, original);
});

test("runner delegates authentication to one imported owner and retains the original call sites", () => {
  const source = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  assert.match(source, /from "\.\/lib\/durable-backend-e2e-auth"/);
  for (const name of ["resolveAccessToken", "authHeaders", "withIdempotency"]) {
    assert.match(source, new RegExp(name + "\\("));
    assert.doesNotMatch(source, new RegExp("function " + name + "\\("));
  }
  assert.doesNotMatch(source, /function encodeJson\(/);
  assert.doesNotMatch(source, /createPrivateKey|signJwt/);
});
