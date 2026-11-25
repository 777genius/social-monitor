import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const traceabilityPath = 'ops/release/e2e-acceptance-traceability.json';
const packagePath = 'package.json';
const allowedEvidenceKinds = new Set(['command', 'contract', 'doc', 'e2e']);

const errors = [];
const traceability = readJson(traceabilityPath);
const packageJson = readJson(packagePath);
const scripts = packageJson.scripts ?? {};
const verifyScript = readScript('verify');

if (traceability.schemaVersion !== 1) {
  errors.push(`${traceabilityPath}: schemaVersion must be 1`);
}

if (!Array.isArray(traceability.planReferences) || traceability.planReferences.length === 0) {
  errors.push(`${traceabilityPath}: planReferences must be a non-empty array`);
} else {
  for (const planPath of traceability.planReferences) {
    validatePathExists(planPath, 'plan reference');
  }
}

if (!Array.isArray(traceability.requiredScenarioIds) || traceability.requiredScenarioIds.length === 0) {
  errors.push(`${traceabilityPath}: requiredScenarioIds must be a non-empty array`);
}

if (!Array.isArray(traceability.entries) || traceability.entries.length === 0) {
  errors.push(`${traceabilityPath}: entries must be a non-empty array`);
}

const entriesById = new Map();
for (const entry of Array.isArray(traceability.entries) ? traceability.entries : []) {
  validateEntry(entry);
  if (typeof entry.id === 'string') {
    if (entriesById.has(entry.id)) {
      errors.push(`${traceabilityPath}: duplicate scenario id ${entry.id}`);
    }
    entriesById.set(entry.id, entry);
  }
}

for (const scenarioId of Array.isArray(traceability.requiredScenarioIds) ? traceability.requiredScenarioIds : []) {
  if (typeof scenarioId !== 'string' || scenarioId.trim().length === 0) {
    errors.push(`${traceabilityPath}: requiredScenarioIds contains a blank or non-string id`);
    continue;
  }

  if (!entriesById.has(scenarioId)) {
    errors.push(`${traceabilityPath}: required scenario ${scenarioId} is missing from entries`);
  }
}

for (const entryId of entriesById.keys()) {
  if (!traceability.requiredScenarioIds.includes(entryId)) {
    errors.push(`${traceabilityPath}: entry ${entryId} is not listed in requiredScenarioIds`);
  }
}

if (errors.length > 0) {
  console.error(`E2E acceptance traceability failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`E2E acceptance traceability OK: ${entriesById.size} scenarios verified`);

function validateEntry(entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    errors.push(`${traceabilityPath}: every entry must be an object`);
    return;
  }

  if (typeof entry.id !== 'string' || entry.id.trim().length === 0) {
    errors.push(`${traceabilityPath}: entry id must be a non-empty string`);
  }

  if (!['acceptance', 'negative', 'regression'].includes(entry.type)) {
    errors.push(`${entryLabel(entry)}: type must be acceptance, negative or regression`);
  }

  if (typeof entry.title !== 'string' || entry.title.trim().length === 0) {
    errors.push(`${entryLabel(entry)}: title must be a non-empty string`);
  }

  if (entry.required !== true) {
    errors.push(`${entryLabel(entry)}: required must be true`);
  }

  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
    errors.push(`${entryLabel(entry)}: evidence must be a non-empty array`);
    return;
  }

  let hasExecutableEvidence = false;
  for (const evidence of entry.evidence) {
    validateEvidence(entry, evidence);
    if (evidence?.kind === 'command' || evidence?.kind === 'e2e') {
      hasExecutableEvidence = true;
    }
  }

  if (!hasExecutableEvidence) {
    errors.push(`${entryLabel(entry)}: at least one command or e2e evidence item is required`);
  }
}

function validateEvidence(entry, evidence) {
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) {
    errors.push(`${entryLabel(entry)}: every evidence item must be an object`);
    return;
  }

  if (!allowedEvidenceKinds.has(evidence.kind)) {
    errors.push(`${entryLabel(entry)}: unsupported evidence kind ${String(evidence.kind)}`);
    return;
  }

  if (evidence.kind === 'command') {
    validateCommand(entry, evidence.command);
    return;
  }

  if (typeof evidence.path !== 'string' || evidence.path.trim().length === 0) {
    errors.push(`${entryLabel(entry)}: ${evidence.kind} evidence path must be non-empty`);
    return;
  }

  validatePathExists(evidence.path, `${entryLabel(entry)} ${evidence.kind} evidence`);

  if (evidence.kind === 'e2e') {
    const normalized = normalizePathForCheck(evidence.path);
    if (!normalized.startsWith('test/e2e/') || !normalized.endsWith('.e2e-spec.ts')) {
      errors.push(`${entryLabel(entry)}: e2e evidence must point at test/e2e/*.e2e-spec.ts, got ${evidence.path}`);
    }
  }

  if (Array.isArray(evidence.markers)) {
    validateMarkers(entry, evidence.path, evidence.markers);
  } else {
    errors.push(`${entryLabel(entry)}: ${evidence.path} must declare marker strings`);
  }
}

function validateCommand(entry, command) {
  if (typeof command !== 'string' || command.trim().length === 0) {
    errors.push(`${entryLabel(entry)}: command evidence must be a non-empty string`);
    return;
  }

  const match = /^npm run ([A-Za-z0-9:_-]+)$/.exec(command);
  if (match === null) {
    errors.push(`${entryLabel(entry)}: command must use "npm run <script>", got ${command}`);
    return;
  }

  const scriptName = match[1];
  if (!Object.hasOwn(scripts, scriptName)) {
    errors.push(`${entryLabel(entry)}: package.json is missing script ${scriptName}`);
  }

  if (scriptName !== 'verify' && !verifyScript.includes(command)) {
    errors.push(`${entryLabel(entry)}: verify script must include ${command}`);
  }
}

function validateMarkers(entry, relativePath, markers) {
  if (markers.length === 0) {
    errors.push(`${entryLabel(entry)}: ${relativePath} must declare at least one marker`);
    return;
  }

  const content = readText(relativePath);
  for (const marker of markers) {
    if (typeof marker !== 'string' || marker.trim().length === 0) {
      errors.push(`${entryLabel(entry)}: ${relativePath} contains a blank marker`);
      continue;
    }

    if (!content.includes(marker)) {
      errors.push(`${entryLabel(entry)}: marker "${marker}" was not found in ${relativePath}`);
    }
  }
}

function validatePathExists(relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    errors.push(`${label}: path must be a non-empty string`);
    return;
  }

  if (!existsSync(resolvePath(relativePath))) {
    errors.push(`${label}: ${relativePath} does not exist`);
  }
}

function readScript(scriptName) {
  const script = scripts[scriptName];
  if (typeof script !== 'string' || script.trim().length === 0) {
    errors.push(`${packagePath}: missing non-empty script ${scriptName}`);
    return '';
  }

  return script;
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(resolvePath(relativePath), 'utf8');
}

function resolvePath(relativePath) {
  return path.resolve(root, relativePath);
}

function normalizePathForCheck(relativePath) {
  return relativePath.replaceAll('\\', '/');
}

function entryLabel(entry) {
  return `${traceabilityPath}:${typeof entry.id === 'string' ? entry.id : '<missing id>'}`;
}
