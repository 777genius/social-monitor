// Reconstruct the reviewed source lineage and build the one-shot CODEX_HOME
// profile with an explicitly supplied offline toolchain.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [toolchain, output] = process.argv.slice(2);
assert.ok(
  toolchain && output,
  "Usage: node scripts/rebuild-vioxen-subscription-runtime-one-shot-home.mjs TOOLCHAIN_NODE_MODULES OUTPUT_TGZ",
);

const root = await mkdtemp(join(tmpdir(), "sm-one-shot-home-build-"));
const source = join(root, "source");
const pack = join(root, "pack");
const parent = JSON.parse(
  await readFile(
    join(
      repositoryRoot,
      "vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.2.provenance.json",
    ),
    "utf8",
  ),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function run(command, args, cwd = source, input) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
    input,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  process.stdout.write(result.stdout);
}

await mkdir(source);
await mkdir(pack);
for (const artifact of [parent.baseSource, parent.reviewedSourcePatch]) {
  assert.equal(
    hash(await readFile(join(repositoryRoot, artifact.path))),
    artifact.sha256,
  );
}
const parentArchive = join(
  repositoryRoot,
  "vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.2.tgz",
);
assert.equal(hash(await readFile(parentArchive)), parent.sha256);
run("tar", ["-xzf", join(repositoryRoot, parent.baseSource.path), "-C", source]);
run("git", ["apply", join(repositoryRoot, parent.reviewedSourcePatch.path)]);
for (const patch of ["sm.1", "sm.2", "sm.3"]) {
  run("git", [
    "apply",
    join(
      repositoryRoot,
      `vendor/patches/vioxen-subscription-runtime-0.1.0-main.42-${patch}.patch`,
    ),
  ]);
}

await cp(resolve(toolchain), join(source, "node_modules"), { recursive: true });
const observabilityLink = join(
  source,
  "node_modules/@vioxen/agent-account-observability",
);
await mkdir(dirname(observabilityLink), { recursive: true });
await rm(observabilityLink, { recursive: true, force: true });
await symlink("../../packages/agent-account-observability", observabilityLink);
for (const [name, version] of Object.entries({
  typescript: "6.0.3",
  vitest: "4.1.8",
  "@types/node": "22.20.0",
})) {
  assert.equal(
    JSON.parse(await readFile(join(source, "node_modules", name, "package.json")))
      .version,
    version,
  );
}

run("npm", ["run", "build"]);
run("tar", ["-xzf", parentArchive, "-C", pack]);
const packageRoot = join(pack, "package");
await cp(join(source, "dist"), join(packageRoot, "dist"), { recursive: true });
await cp(
  join(source, "packages/agent-account-observability/dist"),
  join(packageRoot, "node_modules/@vioxen/agent-account-observability/dist"),
  { recursive: true },
);
const manifestPath = join(packageRoot, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.version = "0.1.0-main.42-sm.3";
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

async function files(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) {
      result.push(...(await files(join(directory, entry.name), `${name}/`)));
    } else {
      assert.ok(entry.isFile(), name);
      result.push(name);
    }
  }
  return result.sort();
}

const packedFiles = await files(pack);
await Promise.all(
  packedFiles.map((path) => utimes(join(pack, path), new Date(0), new Date(0))),
);
if (process.platform === "darwin") {
  const uncompressedArchive = `${resolve(output)}.tmp`;
  run(
    "tar",
    [
      "-cf",
      uncompressedArchive,
      "--uid",
      "0",
      "--gid",
      "0",
      "--uname",
      "root",
      "--gname",
      "root",
      "-T",
      "-",
    ],
    pack,
    `${packedFiles.join("\n")}\n`,
  );
  await pipeline(
    createReadStream(uncompressedArchive),
    createGzip({ level: 9 }),
    createWriteStream(resolve(output)),
  );
  await rm(uncompressedArchive, { force: true });
} else {
  run(
    "tar",
    [
        "--mtime=@0",
        "--owner=0",
        "--group=0",
        "--numeric-owner",
        "--no-recursion",
        "-czf",
        resolve(output),
        "-T",
        "-",
    ],
    pack,
    `${packedFiles.join("\n")}\n`,
  );
}
process.stdout.write(
  `${JSON.stringify({
    source,
    archive: resolve(output),
    sha256: hash(await readFile(resolve(output))),
  })}\n`,
);
