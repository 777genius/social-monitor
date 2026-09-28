import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readMimoApiKeyFile } from "./mimo-key-file.mjs";

test("MiMo credential file is owner-readable, regular, and never exposed in errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "mimo-key-file-test-"));
  const file = join(root, "synthetic-key");
  const link = join(root, "synthetic-link");
  const fakeKey = "synthetic-mimo-test-key-do-not-use";
  try {
    await writeFile(file, `${fakeKey}\n`, { mode: 0o600 });
    assert.equal(await readMimoApiKeyFile(file), fakeKey);
    await symlink(file, link);
    await assert.rejects(readMimoApiKeyFile(link), (error) =>
      !String(error).includes(fakeKey));
    await chmod(file, 0o644);
    await assert.rejects(readMimoApiKeyFile(file), (error) =>
      !String(error).includes(fakeKey));
    await chmod(file, 0o600);
    await writeFile(file, `${fakeKey}\nsecond-line`);
    await assert.rejects(readMimoApiKeyFile(file), (error) =>
      !String(error).includes(fakeKey));
    await assert.rejects(readMimoApiKeyFile(undefined), /not configured/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
