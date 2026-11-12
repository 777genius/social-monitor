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

const positionsManifest = "docs/iterations/2026-11-08-summary-model-adapters-10k-positions.json";
const ledger = JSON.parse(readFileSync(positionsManifest, "utf8"));
if (ledger.schemaVersion !== 1 || ledger.baseline !== baseline || !Array.isArray(ledger.slices)) {
  fail("original-position ledger schema or pinned baseline mismatch");
}
const originalSet = new Set(originalPaths);
const changedSet = new Set(changed);
const usedPositions = new Set();
let verifiedPositions = 0;
for (const slice of ledger.slices) {
  const path = directory + slice.original;
  const owner = directory + slice.owner;
  if (!originalSet.has(path) || !source(owner) || path === owner) {
    fail(`invalid original/specialist responsibility pair: ${path} -> ${owner}`);
  }
  if (!changedSet.has(path)) fail(`unchanged original falsely credited: ${path}`);
  if (!Array.isArray(slice.originalPositions) || slice.originalPositions.length === 0 ||
    typeof slice.responsibility !== "string" || slice.responsibility.trim().length === 0) {
    fail(`missing explicit original coordinates/responsibility for ${path}`);
  }
  const frozenLines = git("show", `${baseline}:${path}`).replace(/\r\n/gu, "\n").split("\n");
  const ownerBody = git("show", `HEAD:${owner}`).replace(/\r\n/gu, "\n");
  let currentOriginal = "";
  try {
    currentOriginal = git("show", `HEAD:${path}`);
  } catch {
    // Deleted original has no retained statements; blob identity is checked above.
  }
  const retainedOriginalLines = new Set(currentOriginal.split("\n").map((line) => line.trim()));
  const importClausePositions = new Set();
  let inImport = false;
  for (let i = 0; i < frozenLines.length; i += 1) {
    const line = frozenLines[i].trim();
    if (/^(?:import\b|export\s+\{)/u.test(line)) inImport = true;
    if (inImport) importClausePositions.add(i + 1);
    if (inImport && /;\s*$/u.test(line)) inImport = false;
  }
  const occurrences = new Map();
  for (const line of ownerBody.split("\n")) {
    const trimmed = line.trim();
    occurrences.set(trimmed, (occurrences.get(trimmed) ?? 0) + 1);
  }
  for (const position of slice.originalPositions) {
    const coordinate = `${path}:${position}`;
    if (!Number.isSafeInteger(position) || position < 1 || position > frozenLines.length ||
      usedPositions.has(coordinate)) fail(`duplicate or invalid pinned position: ${coordinate}`);
    usedPositions.add(coordinate);
    const line = frozenLines[position - 1].trim();
    if (!line || /^(?:\/\/|\/\*|\*|\*\/|import\b|export\s+type\b|[{};]+$)/u.test(line)) {
      fail(`non-implementation original position: ${coordinate}`);
    }
    if (importClausePositions.has(position) || /^\)\s*:\s*.+=>/u.test(line)) {
      fail(`import/return-type signature is not original implementation: ${coordinate}`);
    }
    if (retainedOriginalLines.has(line)) {
      fail(`original statement still present in unchanged owner responsibility: ${coordinate}`);
    }
    const remaining = occurrences.get(line) ?? 0;
    if (remaining === 0) fail(`original position absent from specialist owner: ${coordinate}`);
    occurrences.set(line, remaining - 1);
    verifiedPositions += 1;
  }
}
console.log(`Machine-verified disjoint original implementation-position subset: ${verifiedPositions} across ${ledger.slices.length} slices`);
console.log("Position trace establishes source provenance only; excludes unchanged originals, not a complete ledger or accepted meaningful 10,000 LOC.");
