import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

/**
 * Static consistency checks between api.nomad.hcl and api.Dockerfile.
 * Neither rollout.test.mjs nor api-env-entrypoint.test.mjs exercises the
 * real files together (both use in-memory fakes for the entrypoint's env
 * path), so a mismatch between the image's baked-in default and the
 * jobspec's volume mount would previously reach production undetected and
 * crash-loop the task on every start with ENOENT.
 */

const here = dirname(fileURLToPath(import.meta.url));
const jobspec = readFileSync(join(here, "api.nomad.hcl"), "utf8");
const dockerfile = readFileSync(join(here, "api.Dockerfile"), "utf8");

test("api.nomad.hcl overrides SOCIAL_MONITOR_API_ENV_FILE to a path inside its own volume mount", () => {
  const mountMatch = jobspec.match(/destination\s*=\s*"([^"]+)"/);
  assert.ok(mountMatch, "expected a volume_mount destination in api.nomad.hcl");
  const mountDestination = mountMatch[1];

  const envOverrideMatch = jobspec.match(/SOCIAL_MONITOR_API_ENV_FILE\s*=\s*"([^"]+)"/);
  assert.ok(envOverrideMatch, "api.nomad.hcl must override SOCIAL_MONITOR_API_ENV_FILE explicitly");
  const envOverridePath = envOverrideMatch[1];

  assert.ok(
    envOverridePath.startsWith(`${mountDestination}/`),
    `SOCIAL_MONITOR_API_ENV_FILE (${envOverridePath}) must live inside the mounted volume (${mountDestination}), ` +
      "or the entrypoint will read a path nothing ever wrote to",
  );
});

test("the Dockerfile's baked-in default path is never the one actually used under Nomad", () => {
  const dockerfileDefaultMatch = dockerfile.match(/ENV SOCIAL_MONITOR_API_ENV_FILE=(\S+)/);
  assert.ok(dockerfileDefaultMatch, "api.Dockerfile must set a default SOCIAL_MONITOR_API_ENV_FILE");
  const dockerfileDefault = dockerfileDefaultMatch[1];

  const envOverrideMatch = jobspec.match(/SOCIAL_MONITOR_API_ENV_FILE\s*=\s*"([^"]+)"/);
  assert.ok(envOverrideMatch);

  assert.notEqual(
    envOverrideMatch[1],
    dockerfileDefault,
    "api.nomad.hcl must override the image's local-testing default, not silently rely on it matching a real mount",
  );
});
