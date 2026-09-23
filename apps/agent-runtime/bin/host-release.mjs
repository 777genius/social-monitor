#!/usr/bin/env node

// Product-specific host artifact for the systemd bridge. No service is started here.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const entry = "dist/apps/agent-runtime/src/main.js";
const cli = "apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs";
const vendoredCliImport = "node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner-cli.js";
const target = Object.freeze({ platform: process.platform, arch: process.arch });
const codexNativeBinary = `node_modules/@openai/codex-linux-${target.arch}/vendor/${
  target.arch === "x64" ? "x86_64-unknown-linux-musl" : "aarch64-unknown-linux-musl"
}/bin/codex`;
const helpers = [
  "assessment-cli-progress.mjs", "assessment-cli-lifecycle.mjs",
  "pinned-codex-native-binary.mjs", "subscription-runtime-failure-details.mjs",
  "codex-worker-cli-usage.mjs", "codex-auth-pool-manifest.mjs",
  "codex-auth-pool-routing.mjs", "subscription-runtime-purpose-model-policy.mjs",
  "reader-promotion-v2-canary-contract.cjs",
];
const forbidden = /^(?:\.env(?:\..*)?|\.git|\.npmrc|auth\.json|fixtures?|__tests__|tests?|.*\.(?:test|spec|fixture)(?:\..*)?)$/i;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function hashFile(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

function option(args, flag) {
  const position = args.indexOf(flag);
  if (position < 0 || !args[position + 1]) throw new Error(`Missing ${flag}`);
  return args[position + 1];
}

function inside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function run(command, args, cwd, extraEnv = {}) {
  await new Promise((done, fail) => {
    const child = spawn(command, args, {
      cwd, stdio: "inherit", env: { ...process.env, npm_config_include: "", ...extraEnv },
    });
    child.on("error", fail);
    child.on("exit", (code) => code === 0 ? done() : fail(new Error(`${command} exited ${code}`)));
  });
}

async function gitOutput(args) {
  return new Promise((done, fail) => {
    let value = "";
    const child = spawn("git", args, { cwd: sourceRoot });
    child.stdout.on("data", (chunk) => { value += chunk; });
    child.on("error", fail);
    child.on("exit", (code) => code === 0 ? done(value.trim()) : fail(new Error(`git ${args[0]} failed`)));
  });
}

export async function assertPinnedHelperClosure(binDir) {
  const expected = new Set(helpers);
  const visited = new Set();
  const pending = [basename(cli)];
  const pattern = /from\s*["'](\.[^"']+)["']|import\s*\(\s*["'](\.[^"']+)["']|import\s*["'](\.[^"']+)["']|require\s*\(\s*["'](\.[^"']+)["']/g;
  while (pending.length > 0) {
    const name = pending.pop();
    if (visited.has(name)) continue;
    visited.add(name);
    const source = await readFile(join(binDir, name), "utf8");
    for (const match of source.matchAll(pattern)) {
      const specifier = match.slice(1).find(Boolean);
      if (specifier === `../../../${vendoredCliImport}`) continue;
      if (!specifier.startsWith("./") || specifier.slice(2).includes("/")) {
        throw new Error(`Agent runtime wrapper import leaves pinned helper directory: ${specifier}`);
      }
      const dependency = specifier.slice(2);
      if (!expected.has(dependency)) {
        throw new Error(`Agent runtime wrapper import is not pinned: ${dependency}`);
      }
      pending.push(dependency);
    }
  }
  if (visited.size !== expected.size + 1) {
    throw new Error("Pinned agent runtime helper closure does not match imports");
  }
}

export async function treeHash(root) {
  const entries = [];
  async function walk(dir, prefix) {
    for (const name of (await readdir(dir)).sort()) {
      if (forbidden.test(name)) throw new Error(`Forbidden release path: ${join(prefix, name)}`);
      const rel = prefix ? `${prefix}/${name}` : name;
      const path = join(dir, name);
      const st = await lstat(path);
      const mode = (st.mode & 0o777).toString(8);
      if (st.isSymbolicLink()) {
        const target = await readlink(path);
        const resolved = await realpath(path);
        if (!inside(root, resolved)) throw new Error(`Symlink escapes release: ${rel}`);
        entries.push([rel, "link", mode, target]);
      } else if (st.isDirectory()) {
        entries.push([rel, "dir", mode]);
        await walk(path, rel);
      } else if (st.isFile()) {
        entries.push([rel, "file", mode, await hashFile(path)]);
      } else {
        throw new Error(`Unsupported release entry: ${rel}`);
      }
    }
  }
  await walk(root, "");
  return sha(Buffer.from(JSON.stringify(entries)));
}

async function pruneForbidden(dir) {
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    if (forbidden.test(name)) {
      await rm(path, { recursive: true, force: true });
    } else if ((await lstat(path)).isDirectory()) {
      await pruneForbidden(path);
    }
  }
}

async function sealTree(dir) {
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    const st = await lstat(path);
    if (st.isDirectory()) await sealTree(path);
    else if (st.isFile()) await chmod(path, st.mode & 0o111 ? 0o755 : 0o644);
  }
  await chmod(dir, 0o755);
}

async function requireFile(root, rel) {
  const st = await lstat(join(root, rel)).catch(() => undefined);
  if (!st?.isFile()) throw new Error(`Missing regular release file: ${rel}`);
}

async function requireReadOnlyForService(root, serviceUid) {
  async function walk(path) {
    const st = await lstat(path);
    if (st.uid === serviceUid || (!st.isSymbolicLink() && (st.mode & 0o022) !== 0)) {
      throw new Error(`Release can be modified by service UID: ${relative(root, path) || "."}`);
    }
    if (st.isDirectory()) {
      for (const name of await readdir(path)) await walk(join(path, name));
    }
  }
  await walk(root);
}

export async function verifyArchive(args) {
  const manifestPath = resolve(option(args, "--manifest"));
  const archive = resolve(option(args, "--archive"));
  const expectedCommit = option(args, "--expect-product-commit");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.productCommit !== expectedCommit ||
      manifest.sourceCommit !== expectedCommit ||
      !/^[a-f0-9]{40}$/.test(expectedCommit)) throw new Error("Product commit mismatch");
  if (manifest.entry !== entry || manifest.cli !== cli ||
      JSON.stringify(manifest.helpers) !== JSON.stringify(helpers)) throw new Error("Release path contract mismatch");
  if (manifest.target?.platform !== target.platform || manifest.target?.arch !== target.arch) {
    throw new Error("Host release target mismatch");
  }
  if (manifest.archive !== basename(archive) || await hashFile(archive) !== manifest.archiveSha256) {
    throw new Error("Archive SHA-256 mismatch");
  }
  return manifest;
}

export async function verify(args) {
  const root = resolve(option(args, "--release-dir"));
  if (!(await lstat(root)).isDirectory() || await realpath(root) !== root) {
    throw new Error("Release root must be a real directory");
  }
  const serviceUid = Number(option(args, "--service-uid"));
  if (!Number.isSafeInteger(serviceUid) || serviceUid <= 0) throw new Error("Service UID must be a non-root numeric UID");
  const manifest = await verifyArchive(args);
  await requireFile(root, entry);
  await requireFile(root, cli);
  if (((await lstat(join(root, cli))).mode & 0o111) !== 0o111) {
    throw new Error("Agent runtime CLI is not executable for the service UID");
  }
  for (const helper of helpers) {
    const path = `apps/agent-runtime/bin/${helper}`;
    await requireFile(root, path);
    if (await hashFile(join(root, path)) !== manifest.helperSha256?.[helper]) {
      throw new Error(`Helper SHA-256 mismatch: ${helper}`);
    }
  }
  await requireFile(root, "package.json");
  await requireFile(root, "package-lock.json");
  await requireFile(root, "node_modules/@vioxen/subscription-runtime/package.json");
  await requireFile(root, vendoredCliImport);
  await requireFile(root, "node_modules/@openai/codex/package.json");
  await requireFile(root, `node_modules/@openai/codex-linux-${target.arch}/package.json`);
  await requireFile(root, codexNativeBinary);
  if (((await lstat(join(root, codexNativeBinary))).mode & 0o111) !== 0o111) {
    throw new Error("Pinned Codex native binary is not executable for the service UID");
  }
  if (await hashFile(join(root, cli)) !== manifest.wrapperSha256 ||
      await hashFile(join(root, "package-lock.json")) !== manifest.lockfileSha256 ||
      await treeHash(root) !== manifest.treeSha256) throw new Error("Staged release bytes mismatch");
  await requireReadOnlyForService(root, serviceUid);
  const runtime = JSON.parse(await readFile(join(root, "node_modules/@vioxen/subscription-runtime/package.json"), "utf8"));
  if (runtime.name !== "@vioxen/subscription-runtime" || runtime.version !== "0.1.0-main.42-sm.3") {
    throw new Error("Vendored runtime identity mismatch");
  }
  process.stdout.write("Host release staging verified\n");
}

async function build(args) {
  if (target.platform !== "linux" || !["x64", "arm64"].includes(target.arch) ||
      Number(process.versions.node.split(".")[0]) < 22) {
    throw new Error("Host release requires Linux x64/arm64 and Node 22 or newer");
  }
  const output = resolve(option(args, "--output-dir"));
  if (inside(sourceRoot, output)) throw new Error("Host release output must be outside the product checkout");
  const scratch = await mkdtemp(join(tmpdir(), "sm-agent-host-release-"));
  process.env.npm_config_cache ??= join(scratch, "npm-cache");
  const stage = join(scratch, "stage");
  const install = join(scratch, "install");
  try {
    const commit = await gitOutput(["rev-parse", "HEAD"]);
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Source commit is invalid");
    if (await gitOutput(["status", "--porcelain", "--untracked-files=all"])) {
      throw new Error("Host release requires a clean product checkout");
    }
    await assertPinnedHelperClosure(join(sourceRoot, "apps/agent-runtime/bin"));
    await run("npm", ["run", "prisma:generate"], sourceRoot, {
      DATABASE_URL: "postgresql://agent_runtime_build:synthetic@127.0.0.1:1/agent_runtime_build",
    });
    await run("npm", ["run", "build"], sourceRoot);
    if (await gitOutput(["status", "--porcelain", "--untracked-files=all"])) {
      throw new Error("TypeScript build changed tracked product sources");
    }
    await mkdir(output, { recursive: true });
    if (inside(sourceRoot, await realpath(output))) {
      throw new Error("Host release output resolves into the product checkout");
    }
    await mkdir(stage, { recursive: true });
    await mkdir(join(install, "vendor"), { recursive: true });
    for (const name of ["package.json", "package-lock.json"]) {
      await copyFile(join(sourceRoot, name), join(install, name));
      await copyFile(join(sourceRoot, name), join(stage, name));
    }
    for (const name of ["infinity-context-sdk-0.1.0.tgz", "vioxen-subscription-runtime-0.1.0-main.42-sm.3.tgz"]) {
      await copyFile(join(sourceRoot, "vendor", name), join(install, "vendor", name));
    }
    await run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], install);
    await cp(join(sourceRoot, "dist/apps/agent-runtime"), join(stage, "dist/apps/agent-runtime"), { recursive: true });
    await cp(join(sourceRoot, "dist/libs"), join(stage, "dist/libs"), { recursive: true });
    await cp(join(install, "node_modules"), join(stage, "node_modules"), {
      recursive: true, verbatimSymlinks: true,
    });
    await mkdir(join(stage, "apps/agent-runtime/bin"), { recursive: true });
    for (const name of [basename(cli), ...helpers]) {
      await copyFile(join(sourceRoot, "apps/agent-runtime/bin", name), join(stage, "apps/agent-runtime/bin", name));
    }
    await chmod(join(stage, cli), 0o755);
    await pruneForbidden(stage);
    await requireFile(stage, entry);
    await requireFile(stage, vendoredCliImport);
    await requireFile(stage, "node_modules/@openai/codex/package.json");
    await requireFile(stage, `node_modules/@openai/codex-linux-${target.arch}/package.json`);
    await requireFile(stage, codexNativeBinary);
    await sealTree(stage);
    if (((await lstat(join(stage, codexNativeBinary))).mode & 0o111) !== 0o111) {
      throw new Error("Pinned Codex native binary is not executable in the release");
    }
    const treeSha256 = await treeHash(stage);
    const helperSha256 = Object.fromEntries(await Promise.all(helpers.map(async (name) =>
      [name, await hashFile(join(stage, "apps/agent-runtime/bin", name))])));
    const archiveName = `agent-runtime-host-${commit}-linux-${target.arch}.tar.gz`;
    const tarPath = join(scratch, "release.tar");
    await run("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "--format=gnu", "-cf", tarPath, "-C", stage, "."], scratch);
    const archiveTmp = join(output, `${archiveName}.tmp`);
    await pipeline(createReadStream(tarPath), createGzip({ level: 9 }), createWriteStream(archiveTmp));
    const manifest = {
      schemaVersion: 1, sourceCommit: commit, productCommit: commit, target,
      entry, cli, helpers, helperSha256,
      archive: archiveName, archiveSha256: await hashFile(archiveTmp),
      wrapperSha256: await hashFile(join(stage, cli)),
      lockfileSha256: await hashFile(join(stage, "package-lock.json")), treeSha256,
    };
    const manifestName = `${archiveName}.json`;
    await rename(archiveTmp, join(output, archiveName));
    await writeFile(join(output, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "w" });
    process.stdout.write(`${join(output, archiveName)}\n${join(output, manifestName)}\n`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === "build") await build(args);
    else if (command === "verify-archive") {
      await verifyArchive(args);
      process.stdout.write("Host release archive verified\n");
    }
    else if (command === "verify") await verify(args);
    else throw new Error("Usage: host-release.mjs build --output-dir DIR | verify-archive --manifest FILE --archive FILE --expect-product-commit SHA | verify --release-dir DIR --manifest FILE --archive FILE --expect-product-commit SHA --service-uid UID");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
