import assert from "node:assert/strict";
import fs from "node:fs";
import fsPromises, { chmod, link as hardLink, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
    await chmod(file, 0o640);
    await assert.rejects(readMimoApiKeyFile(file), /unavailable/u);
    await chmod(file, 0o600);
    const hardlink = join(root, "synthetic-hardlink");
    await hardLink(file, hardlink);
    await assert.rejects(readMimoApiKeyFile(file), /unavailable/u);
    await rm(hardlink);
    await writeFile(file, `${fakeKey}\nsecond-line`);
    await assert.rejects(readMimoApiKeyFile(file), (error) =>
      !String(error).includes(fakeKey));
    await assert.rejects(readMimoApiKeyFile(undefined), /not configured/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("only a trusted root-owned systemd copy admits mode 0440", async (t) => {
  const key = "/run/credentials/social-monitor-summary-agent.service/mimo_key";
  const parentPaths = ["/", "/run", "/run/credentials", "/run/credentials/social-monitor-summary-agent.service"];
  const directory = { uid: 0, gid: 0, mode: 0o40755,
    isDirectory: () => true, isSymbolicLink: () => false };
  const directories = new Map(parentPaths.map((path) => [path, { ...directory }]));
  const metadata = { uid: 0, gid: 0, mode: 0o100440, nlink: 1, size: 16, isFile: () => true };
  const marker = "synthetic-test-only-key";
  let readable = true;
  let writable = false;
  let writableParent = false;
  const realOpen = fsPromises.open;
  const realLstat = fsPromises.lstat;
  const realAccess = fs.accessSync;
  t.mock.method(fsPromises, "open", async (path, flags) => {
    if (String(path).startsWith("/run/credentials/")) {
      if (flags !== (fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)) throw new Error("unsafe open");
      return { stat: async () => metadata, readFile: async () => marker, close: async () => {} };
    }
    return realOpen(path, flags);
  });
  t.mock.method(fsPromises, "lstat", async (path) => {
    if (directories.has(String(path))) return directories.get(String(path));
    return realLstat(path);
  });
  t.mock.method(fs, "accessSync", (path, mode) => {
    if (directories.has(String(path)) && mode === fs.constants.W_OK) {
      if (writableParent) return;
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    }
    if (String(path) !== key) return realAccess(path, mode);
    if (mode === fs.constants.R_OK && readable) return;
    if (mode === fs.constants.W_OK && writable) return;
    throw Object.assign(new Error("denied"), { code: "EACCES" });
  });
  const unavailable = async (path = key) => assert.rejects(readMimoApiKeyFile(path), (error) =>
    String(error).includes("unavailable") && !String(error).includes(marker));
  assert.equal(await readMimoApiKeyFile(key), marker);
  for (const mode of [0o640, 0o644]) {
    metadata.mode = 0o100000 | mode;
    await unavailable();
  }
  metadata.mode = 0o100440;
  metadata.uid = 1;
  await unavailable();
  metadata.uid = 0;
  metadata.gid = 1;
  await unavailable();
  metadata.gid = 0;
  metadata.nlink = 2;
  await unavailable();
  metadata.nlink = 1;
  metadata.size = 4097;
  await unavailable();
  metadata.size = 16;
  directories.get(parentPaths[3]).mode = 0o40775;
  await unavailable();
  directories.get(parentPaths[3]).mode = 0o40755;
  directories.get(parentPaths[3]).uid = 1;
  await unavailable();
  directories.get(parentPaths[3]).uid = 0;
  writableParent = true;
  await unavailable();
  writableParent = false;
  directories.get(parentPaths[3]).isSymbolicLink = () => true;
  await unavailable();
  directories.get(parentPaths[3]).isSymbolicLink = () => false;
  readable = false;
  await unavailable();
  readable = true;
  writable = true;
  await unavailable();
  writable = false;
  await unavailable("/run/credentials/unsafe.unit/mimo_key");
});
