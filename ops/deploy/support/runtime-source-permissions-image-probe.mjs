// Fed on stdin by runtime-source-permissions.test.py, which defines expected.
// Inspect actual /app assets, without a checkout mount or service/provider start.
/* global expected */
import assert from "node:assert/strict";
import console from "node:console";
import { createHash } from "node:crypto";
import { accessSync, constants, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import process from "node:process";

assert.equal(process.getuid(), 1000);
assert.equal(process.getgid(), 1000);
assert.equal(process.cwd(), "/app");
const require = createRequire("/app/package.json");
assert.throws(() => require("/permission-negative/contract.cjs"), { code: "EACCES" });

let filesRead = 0;
function inspect(path) {
  const stats = statSync(path);
  assert.equal(stats.uid, 0, `public app asset must stay root-owned: ${path}`);
  assert.equal(stats.mode & 0o022, 0, `group/other write permission: ${path}`);
  accessSync(path, constants.R_OK);
  if (stats.isDirectory()) {
    accessSync(path, constants.X_OK);
    for (const name of readdirSync(path)) inspect(`${path}/${name}`);
  } else {
    readFileSync(path);
    filesRead++;
  }
}
for (const name of ["apps", "libs", "prisma", "scripts", "vendor", "dist",
  "package.json", "package-lock.json", "tsconfig.json", "tsconfig.build.json", "prisma.config.ts"]) {
  inspect(`/app/${name}`);
}
// Check bytes and executable bits against the restrictive source context.
for (const [name, entry] of Object.entries(expected)) {
  const path = `/app/${name}`;
  assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), entry.sha256, path);
  assert.equal(statSync(path).mode & 0o777, entry.mode, path);
}

// Exercise the exact compiled-to-source import that restart-looped in production.
const compiled = require("/app/dist/apps/agent-runtime/src/reader-promotion-v2-canary-contract.js");
const source = require("/app/apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs");
assert.equal(compiled.readerPromotionV2CanaryOutputSchema, source.readerPromotionV2CanaryOutputSchema);
const policy = await import("/app/apps/agent-runtime/bin/subscription-runtime-purpose-model-policy.mjs");
assert.equal(policy.readerPromotionV2CanaryPurpose, source.readerPromotionV2CanaryPurpose);
JSON.parse(readFileSync("/app/tsconfig.json", "utf8"));
JSON.parse(readFileSync("/app/tsconfig.build.json", "utf8"));
for (const tool of ["/app/apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs",
  "/app/node_modules/.bin/codex", "/app/node_modules/.bin/ts-node", "/app/node_modules/.bin/prisma"]) {
  accessSync(tool, constants.R_OK | constants.X_OK);
}
console.log(JSON.stringify({ uid: process.getuid(), filesRead, compiledContractLoaded: true,
  purposePolicyLoaded: true, restrictiveControlDenied: true, providerCalled: false }));
