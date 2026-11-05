import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiler = require.resolve("typescript/bin/tsc");
const cli = resolve("scripts/rewrite-build-aliases.mjs");
function put(root, file, text) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}
function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
}
function fixture(t, override) {
  const root = mkdtempSync(join(tmpdir(), "sm-build-alias-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  put(root, "tsconfig.json", JSON.stringify({ compilerOptions: {
    module: "commonjs", target: "ES2022", rootDir: "source", outDir: "dist",
    baseUrl: ".", ignoreDeprecations: "6.0", declaration: true, sourceMap: true,
    strict: true, types: [], paths: {
      "@social-monitor/*": ["source/wrong/*"],
      "@social-monitor/lib/*": ["source/libs/*"],
      "@social-monitor/lib/special": ["source/exact.ts"],
      "@social-monitor/lib": ["source/missing.ts", "source/libs/index.ts"],
    },
  }, include: ["source/**/*.ts"] }));
  put(root, "config/tsconfig.build.json", JSON.stringify({ extends: "../tsconfig.json" }));
  put(root, "source/libs/index.ts", 'export const value = 7; export interface Token { value: number }');
  put(root, "source/libs/sub.ts", 'export const sub = 11;');
  put(root, "source/libs/special.ts", 'export const exact = -1;');
  put(root, "source/exact.ts", 'export const exact = 13;');
  put(root, "source/wrong/lib/sub.ts", 'export const sub = -1;');
  put(root, "source/app/references.ts", 'import library = require("@social-monitor/lib"); export type Token = library.Token;');
  put(root, "source/app/relative.ts", 'export const relative = 17;');
  put(root, "source/app/main.ts", `
import { value } from "@social-monitor/lib";
import { sub } from "@social-monitor/lib/sub";
import { exact } from "@social-monitor/lib/special";
import { relative } from "./relative";
export { Token } from "@social-monitor/lib";
export type Selected = import("@social-monitor/lib").Token;
declare module "@social-monitor/lib" { interface Token { optional?: number } }
declare function require(name: string): { sep: string };
export const packageValue = require("node:path").sep;
export const data = "@social-monitor/lib";
export const objectValue = { require: (value: string) => value }.require("@social-monitor/lib");
export const result = value + sub + exact + relative;
export const dynamic = () => import("@social-monitor/lib");
`);
  const out = override ? join(root, "isolated", "compiled") : join(root, "dist");
  const args = ["-p", "config/tsconfig.build.json", ...(override ? ["--outDir", out] : [])];
  const compiled = run(compiler, args, root);
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  return { root, out, args };
}

// Red contracts: module execution/type resolution, target precedence, untouched data,
// map bytes/output isolation, and refusing missing targets/config or unsafe roots.
for (const override of [false, true]) test(`real CommonJS and declarations resolve (${override ? "override" : "default"} outDir)`, async (t) => {
  const { root, out, args } = fixture(t, override);
  const main = join(out, "app/main.js");
  const before = readFileSync(main, "utf8");
  const map = readFileSync(`${main}.map`);
  if (override) put(root, "dist/sentinel.js", "untouched default output");
  const rewritten = run(cli, args, root);
  assert.equal(rewritten.status, 0, rewritten.stderr);
  const after = readFileSync(main, "utf8");
  assert.equal(after, before.replace(/(?<!\.)require\("@social-monitor\/lib"\)/g, 'require("../libs/index")')
    .replaceAll('require("@social-monitor/lib/sub")', 'require("../libs/sub")')
    .replaceAll('require("@social-monitor/lib/special")', 'require("../exact")'));
  assert.deepEqual(readFileSync(`${main}.map`), map);
  const module = require(main);
  assert.equal(module.result, 48);
  assert.equal((await module.dynamic()).value, 7);
  assert.equal(module.data, "@social-monitor/lib");
  assert.equal(module.objectValue, "@social-monitor/lib");
  assert.equal(module.packageValue, "/");
  const declaration = readFileSync(join(out, "app/main.d.ts"), "utf8");
  assert.match(declaration, /import\("\.\.\/libs\/index"\)/);
  assert.match(declaration, /from "\.\.\/libs\/index"/);
  assert.match(declaration, /declare module "\.\.\/libs\/index"/);
  put(root, "consumer.ts", `import { result, Selected } from "./${override ? "isolated/compiled" : "dist"}/app/main"; const selected: Selected = { value: result, optional: 1 };`);
  const typecheck = run(compiler, ["--noEmit", "--strict", "--skipLibCheck", "--ignoreConfig", "consumer.ts"], root);
  assert.equal(typecheck.status, 0, typecheck.stdout + typecheck.stderr);
  if (override) assert.equal(readFileSync(join(root, "dist/sentinel.js"), "utf8"), "untouched default output");
  const second = run(cli, args, root);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readFileSync(main, "utf8"), after);
});

test("ES module syntax and declaration import-equals rewrite only module literals", (t) => {
  const { root, out, args } = fixture(t);
  const source = `import {value} from '@social-monitor/lib'; export {value} from '@social-monitor/lib'; export const load = () => import('@social-monitor/lib'); const data = '@social-monitor/lib'; obj.require('@social-monitor/lib');`;
  const emitted = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  put(out, "esm.js", emitted);
  const result = run(cli, args, root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(out, "esm.js"), "utf8"), emitted
    .replaceAll("from '@social-monitor/lib'", "from './libs/index'")
    .replaceAll("import('@social-monitor/lib')", "import('./libs/index')"));
  assert.match(readFileSync(join(out, "app/references.d.ts"), "utf8"), /require\("\.\.\/libs\/index"\)/);
});

test("unresolved configured alias fails before any file is edited", (t) => {
  const { root, out, args } = fixture(t);
  put(out, "zzz.js", 'require("@social-monitor/lib/missing");');
  const before = readFileSync(join(out, "app/main.js"));
  const result = run(cli, args, root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unresolved configured alias/);
  assert.deepEqual(readFileSync(join(out, "app/main.js")), before);
});

test("missing emitted target, config/output and symlink or overlapping roots are refused", (t) => {
  const { root, out, args } = fixture(t);
  rmSync(join(out, "libs/sub.js"));
  assert.match(run(cli, args, root).stderr, /Unresolved configured alias/);
  assert.equal(run(cli, ["-p", "missing.json"], root).status, 1);
  assert.equal(run(cli, [...args, "--outDir", "missing-output"], root).status, 1);
  assert.match(run(cli, [...args, "--outDir", root], root).stderr, /Unsafe output root/);
  symlinkSync(out, join(root, "linked"), "dir");
  assert.match(run(cli, [...args, "--outDir", "linked"], root).stderr, /Unsafe symlink/);
  symlinkSync(join(root, "source"), join(out, "linked"), "dir");
  assert.match(run(cli, args, root).stderr, /Unsafe symlink/);
});


test("invalid config or emitted syntax fails without partial edits", (t) => {
  const { root, out, args } = fixture(t);
  const before = readFileSync(join(out, "app/main.js"));
  put(out, "zzz.js", 'require("@social-monitor/lib";');
  const result = run(cli, args, root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid emitted module syntax/);
  assert.deepEqual(readFileSync(join(out, "app/main.js")), before);
  put(root, "config/invalid.json", '{');
  assert.equal(run(cli, ["-p", "config/invalid.json"], root).status, 1);
});
