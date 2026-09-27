#!/usr/bin/env node

// Rebuild the isolated MiMo backend from the reviewed source bundle. This
// checks the exact vendored archive without altering the product installation.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const commit = "06065a90beca00ec91436684df2b33677078aa00";
const bundleSha = "0ec1c9e9149aa10563b528d1cb7782f0f2c7622ba6e5c76a8703ed19116dd5f4";
const archiveSha = "f1414428f543a8605ff8c5094d4483271ad2762e4bbd27c29bd8121ee73ab4c2";
const version = "0.1.0-main.40-sm-mimo.4";
const bundle = join(root, "vendor/vioxen-subscription-runtime-06065a90.bundle");
const archive = join(root, `vendor/vioxen-subscription-runtime-${version}.tgz`);
const buildArchive = process.argv.includes("--build-archive");
const scratch = await mkdtemp(join(tmpdir(), "social-monitor-mimo-rebuild-"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

try {
  assert.equal(sha(await readFile(bundle)), bundleSha, "MiMo source bundle changed");
  if (!buildArchive) {
    assert.equal(sha(await readFile(archive)), archiveSha, "MiMo runtime archive changed");
  }
  const gitDir = join(scratch, "git");
  const source = join(scratch, "source");
  const stage = join(scratch, "stage");
  await mkdir(gitDir);
  await mkdir(source);
  await mkdir(stage);
  run("git", ["init", "-q", gitDir]);
  run("git", ["-C", gitDir, "bundle", "unbundle", bundle]);
  assert.equal(run("git", ["-C", gitDir, "cat-file", "-t", commit]).trim(), "commit");
  const sourceTar = join(scratch, "source.tar");
  run("git", ["-C", gitDir, "archive", "--format=tar", "-o", sourceTar, commit]);
  run("tar", ["-xf", sourceTar, "-C", source]);

  const sourceModules = join(source, "node_modules");
  const productModules = join(root, "node_modules");
  await mkdir(sourceModules);
  for (const name of await readdir(productModules)) {
    if (name.startsWith("@")) {
      await mkdir(join(sourceModules, name));
      for (const scoped of await readdir(join(productModules, name))) {
        if (name === "@vioxen" && scoped === "subscription-runtime") continue;
        await symlink(join(productModules, name, scoped), join(sourceModules, name, scoped));
      }
    } else {
      await symlink(join(productModules, name), join(sourceModules, name));
    }
  }
  await symlink(
    join(source, "packages/agent-account-observability"),
    join(sourceModules, "@vioxen/agent-account-observability"),
  );
  // The product's older runtime owns the locked Ajv 8 and Node 22 types.
  const oldRuntimeModules = join(productModules, "@vioxen/subscription-runtime/node_modules");
  await rm(join(sourceModules, "ajv"));
  await symlink(join(oldRuntimeModules, "ajv"), join(sourceModules, "ajv"));
  await mkdir(join(sourceModules, "vitest"));
  await writeFile(join(sourceModules, "vitest/package.json"),
    '{"name":"vitest","version":"4.1.5","types":"index.d.ts"}\n');
  await writeFile(join(sourceModules, "vitest/globals.d.ts"), "export {};\n");
  await writeFile(join(sourceModules, "vitest/index.d.ts"),
    "export const describe: any; export const it: any; export const expect: any;\n");
  run("npm", ["run", "build"], source, {
    PATH: `${join(productModules, ".bin")}:${process.env.PATH ?? ""}`,
    npm_config_cache: join(scratch, "npm-cache"),
  });

  await cp(join(source, "dist"), join(stage, "dist"), { recursive: true });
  for (const name of ["README.md", "LICENSE"]) {
    await cp(join(source, name), join(stage, name));
  }
  const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  manifest.version = version;
  delete manifest.workspaces;
  delete manifest.scripts;
  manifest.bundledDependencies = Object.keys(manifest.dependencies);
  const bundled = {
    "@anthropic-ai/claude-agent-sdk": join(productModules, "@anthropic-ai/claude-agent-sdk"),
    "@anthropic-ai/sdk": join(productModules, "@anthropic-ai/sdk"),
    "@modelcontextprotocol/sdk": join(productModules, "@modelcontextprotocol/sdk"),
    "@types/node": join(oldRuntimeModules, "@types/node"),
    "@vioxen/agent-account-observability": join(source, "packages/agent-account-observability"),
    ajv: join(oldRuntimeModules, "ajv"),
    "libsodium-wrappers": join(productModules, "libsodium-wrappers"),
    zod: join(productModules, "zod"),
  };
  for (const name of manifest.bundledDependencies) {
    const target = join(stage, "node_modules", name);
    await mkdir(dirname(target), { recursive: true });
    if (name === "@vioxen/agent-account-observability") {
      await mkdir(target);
      await cp(join(bundled[name], "dist"), join(target, "dist"), { recursive: true });
      await cp(join(bundled[name], "package.json"), join(target, "package.json"));
    } else {
      await cp(bundled[name], target, { recursive: true });
    }
    const installed = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    manifest.dependencies[name] = installed.version;
  }
  await writeFile(join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const output = join(scratch, "packed");
  await mkdir(output);
  run("npm", ["pack", "--ignore-scripts", "--pack-destination", output, "--json"],
    stage, { npm_config_cache: join(scratch, "npm-cache") });
  const rebuiltArchive = join(output, `vioxen-subscription-runtime-${version}.tgz`);
  if (buildArchive) {
    await cp(rebuiltArchive, archive);
    process.stdout.write(`MiMo archive SHA256 ${sha(await readFile(archive))}\n`);
  } else {
    assert.equal(sha(await readFile(rebuiltArchive)),
      archiveSha, "MiMo archive does not rebuild from the reviewed source and pinned dependencies");
  }
  process.stdout.write(`MiMo runtime ${version} rebuilt from ${commit}\n`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

function run(command, args, cwd = root, patch = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...patch },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
