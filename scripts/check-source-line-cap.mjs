import { existsSync, globSync, readFileSync } from "node:fs";

const maxLoc = 1000;
const violations = [];

const sourceTestPatterns = [
  "apps/**/*.{ts,tsx,js,jsx,mjs,cjs,dart,py,sh}",
  "libs/**/*.{ts,tsx,js,jsx,mjs,cjs,dart,py,sh}",
  "test/**/*.{ts,tsx,js,jsx,mjs,cjs,dart,py,sh}",
  "scripts/**/*.{ts,tsx,js,jsx,mjs,cjs,py,sh}",
  "ops/**/*.{ts,tsx,js,jsx,mjs,cjs,py,sh}",
];

const ignoredPathPatterns = [
  /(^|\/)node_modules\//,
  /(^|\/)\.dart_tool\//,
  /(^|\/)\.fvm\//,
  /(^|\/)\.git\//,
  /(^|\/)build\//,
  /(^|\/)dist\//,
  /(^|\/)coverage\//,
  /(^|\/)generated\//,
  /(^|\/)generated_api\/lib\/src\/generated\//,
  /(^|\/)prisma\/generated\//,
  /\.g\.dart$/,
  /\.freezed\.dart$/,
  /\.pb\.dart$/,
  /\.pbgrpc\.dart$/,
];

const legacyLineCapDebt = new Map([
  ["scripts/capture-durable-backend-e2e-loop.ts", 2348],
  ["scripts/check-external-beta-evidence-runner.mjs", 1474],
  ["scripts/check-source-live-certification-evidence.mjs", 1458],
  ["scripts/check-source-provider-runtime-contract.ts", 1475],
  ["scripts/check-staging-reliability-evidence.mjs", 1200],
  ["scripts/external-beta-evidence-runner.mjs", 1842],
]);

function normalizePath(file) {
  return file.replaceAll("\\", "/");
}

function lineCount(source) {
  if (source.length === 0) return 0;
  return source.endsWith("\n")
    ? source.slice(0, -1).split("\n").length
    : source.split("\n").length;
}

function addViolation(file, message) {
  violations.push(`${file}: ${message}`);
}

function isIgnored(file) {
  return ignoredPathPatterns.some((pattern) => pattern.test(file));
}

const sourceTestFiles = Array.from(
  new Set(sourceTestPatterns.flatMap((pattern) => globSync(pattern))),
)
  .map(normalizePath)
  .filter((file) => !isIgnored(file))
  .sort();

const seenFiles = new Set(sourceTestFiles);

for (const [file, debtLimit] of legacyLineCapDebt) {
  if (!existsSync(file)) {
    addViolation(
      file,
      "legacy line-cap debt entry points at a missing file; remove the debt entry",
    );
    continue;
  }

  if (!seenFiles.has(file)) {
    addViolation(
      file,
      "legacy line-cap debt entry is outside the source/test scan set",
    );
  }

  const count = lineCount(readFileSync(file, "utf8"));
  if (count > debtLimit) {
    addViolation(
      file,
      `legacy over-cap file grew from ${debtLimit} to ${count} LOC; split or reduce it before merging`,
    );
  }

  if (count <= maxLoc) {
    addViolation(
      file,
      `legacy line-cap debt is now ${count} LOC; remove this debt entry`,
    );
  }
}

for (const file of sourceTestFiles) {
  if (legacyLineCapDebt.has(file)) {
    continue;
  }

  const count = lineCount(readFileSync(file, "utf8"));
  if (count > maxLoc) {
    addViolation(
      file,
      `source/test file exceeds hard cap ${maxLoc} LOC (${count}); split by responsibility`,
    );
  }
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.scripts?.["check:source-line-cap"] !== "node scripts/check-source-line-cap.mjs") {
  addViolation(
    "package.json",
    "scripts.check:source-line-cap must run node scripts/check-source-line-cap.mjs",
  );
}

if (!String(packageJson.scripts?.verify ?? "").includes("npm run check:source-line-cap")) {
  addViolation(
    "package.json",
    "npm run verify must include npm run check:source-line-cap",
  );
}

for (const ruleFile of ["AGENTS.md", "CLAUDE.md", ".claude/rules/quality-architecture.md"]) {
  const source = readFileSync(ruleFile, "utf8");
  if (!source.includes("1000 LOC")) {
    addViolation(
      ruleFile,
      "agent rules must mention the source/test 1000 LOC hard cap",
    );
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log(
  `Source/test line cap OK: ${sourceTestFiles.length} files scanned, cap ${maxLoc} LOC`,
);
