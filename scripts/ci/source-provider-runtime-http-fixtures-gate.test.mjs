import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("source provider HTTP fixture regressions execute in static CI", () => {
  const target = fileURLToPath(new URL("../lib/source-provider-runtime-http-fixtures.test.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [
    "--experimental-default-type=module",
    "--experimental-strip-types",
    "--test",
    target,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
