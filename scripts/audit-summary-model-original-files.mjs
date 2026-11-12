#!/usr/bin/env node
// Audit the pinned 2026-11-08 original source inventory; this deliberately
// does NOT treat physical LOC, changed files, or moved-only lines as accepted
// refactored implementation LOC.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const baseline = "3fa1b9e9ee5bd1302840d1164a975cde3f0eeaba";
const directory = "libs/summary/adapters/model/";
const manifest = "docs/iterations/2026-11-08-summary-model-adapters-10k-inventory.md";
const git = (...args) => execFileSync("git", args, {
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
});
const source = (path) => path.startsWith(directory) &&
  path.endsWith(".ts") &&
  !/(?:\.spec|\.test|\.spec-support|\.fixture|-test-fixture)\.ts$/u.test(path);
const physicalLines = (text) => {
  if (text.length === 0) return 0;
  const normalized = text.replace(/\r\n/gu, "\n");
  return normalized.split("\n").length - Number(normalized.endsWith("\n"));
};
const fail = (message) => {
  throw new Error(`Summary model baseline audit: ${message}`);
};

const originalPaths = git("ls-tree", "-r", "--name-only", baseline, "--", directory)
  .trimEnd().split("\n").filter(source).sort();
const inventory = readFileSync(manifest, "utf8");
const table = inventory.split("## File-level baseline\n")[1]?.split("\n## ")[0];
if (table === undefined) fail("the pinned inventory table is missing");
const claimed = [...table.matchAll(/^\| `([^`]+\.ts)` \| (\d+) \|$/gmu)]
  .map((match) => ({ path: directory + match[1], lines: Number(match[2]) }))
  .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
if (claimed.length !== 84 || originalPaths.length !== 84) {
  fail(`expected 84 eligible originals, found ${claimed.length} listed / ${originalPaths.length} in Git`);
}
let totalPhysical = 0;
const changed = [];
const unchanged = [];
for (let i = 0; i < originalPaths.length; i += 1) {
  const path = originalPaths[i];
  const entry = claimed[i];
  if (entry.path !== path) fail(`inventory path mismatch at ${path}: ${entry.path}`);
  const body = git("show", `${baseline}:${path}`);
  const lines = physicalLines(body);
  if (entry.lines !== lines) {
    fail(`inventory physical LOC mismatch for ${path}: ${entry.lines} listed / ${lines} original`);
  }
  totalPhysical += lines;
  const baseBlob = git("rev-parse", `${baseline}:${path}`).trim();
  let currentBlob = "";
  try {
    currentBlob = git("rev-parse", "--verify", `HEAD:${path}`).trim();
  } catch {
    // A deleted original is changed, but that alone is never LOC credit.
  }
  (currentBlob === baseBlob ? unchanged : changed).push(path);
}
if (totalPhysical !== 15318) fail(`baseline physical total changed: ${totalPhysical}`);
console.log(`Pinned model originals: ${originalPaths.length} files / ${totalPhysical} PHYSICAL LOC`);
console.log(`Different from pinned blob at HEAD: ${changed.length}; unchanged: ${unchanged.length}`);
for (const path of unchanged) console.log(`UNCHANGED (zero refactored credit): ${path}`);
console.log("This audit grants zero implementation-LOC credit; map unique original code positions to changed responsibilities and independently review them.");
