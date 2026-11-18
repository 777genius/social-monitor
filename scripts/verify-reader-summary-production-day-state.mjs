#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  validateState, validateProof, validateLegacyPublicationBinding, createState,
  assertDate, assertObject, stableJson, reportFilename, proofFilename, fail,
} from './lib/reader-summary-production-day-state-validation.mjs';

const options = parseOptions(process.argv.slice(2));

if (options.has("--latest-state")) {
  assertOnlyOptions(options, ["--latest-state", "--state-dir"]);
  const latestPath = requiredOption(options, "--latest-state");
  const stateDirectory = requiredOption(options, "--state-dir");
  const latestBytes = readFileSync(latestPath);
  const state = validateState(parseJson(latestBytes, latestPath));
  const datedPath = join(stateDirectory, stateFilename(state.requestedDate));
  const datedBytes = readFileSync(datedPath);
  if (!latestBytes.equals(datedBytes)) {
    fail("latest state does not exactly match its immutable dated state");
  }
  validateBinding(state, join(stateDirectory, state.binding.filename));
  process.stdout.write(state.requestedDate);
  process.exit(0);
}

if (options.has("--dated-state")) {
  assertOnlyOptions(options, ["--dated-state", "--state-dir"]);
  const datedPath = requiredOption(options, "--dated-state");
  const stateDirectory = requiredOption(options, "--state-dir");
  const state = validateState(parseJson(readFileSync(datedPath), datedPath));
  if (basename(datedPath) !== stateFilename(state.requestedDate)) {
    fail("dated state filename does not match its requested date");
  }
  validateBinding(state, join(stateDirectory, state.binding.filename));
  process.stdout.write(state.requestedDate);
  process.exit(0);
}

if (options.has("--legacy-latest")) {
  assertOnlyOptions(options, [
    "--legacy-latest",
    "--state-dir",
    "--state-out",
  ]);
  const latestPath = requiredOption(options, "--legacy-latest");
  const stateDirectory = requiredOption(options, "--state-dir");
  const stateOutPath = requiredOption(options, "--state-out");
  const legacy = validateLegacyPublication(latestPath, stateDirectory);
  writeState(stateOutPath, buildState(
    legacy.requestedDate,
    legacy.proofPath,
    true,
  ));
  process.stdout.write(legacy.requestedDate);
  process.exit(0);
}

assertOnlyOptions(options, [
  "--expected-date",
  "--publication-proof",
  "--state",
  "--state-out",
  "--terminal-outcome",
]);
const expectedDate = requiredOption(options, "--expected-date");
assertDate(expectedDate);
const proofPath = options.get("--publication-proof");
const outcomePath = options.get("--terminal-outcome");
if ((proofPath === undefined) === (outcomePath === undefined)) {
  fail("provide exactly one publication proof or terminal outcome");
}
const statePath = options.get("--state");
const stateOutPath = options.get("--state-out");
if ((statePath === undefined) === (stateOutPath === undefined)) {
  fail("provide exactly one of --state or --state-out");
}

const bindingPath = proofPath ?? outcomePath;
const state = buildState(expectedDate, bindingPath, proofPath !== undefined);
if (stateOutPath !== undefined) {
  writeState(stateOutPath, state);
} else {
  const actual = validateState(parseJson(readFileSync(statePath), statePath));
  if (stableJson(actual) !== stableJson(state)) {
    fail("day state does not exactly bind its verified terminal artifact");
  }
}
console.log(
  `Reader summary production-day state OK (${expectedDate}, ${state.state})`,
);

function validateLegacyPublication(latestPath, stateDirectory) {
  const latestBytes = readFileSync(latestPath);
  const report = parseJson(latestBytes, latestPath);
  assertObject(report, "legacy latest report");
  assertDate(report.requestedDate);
  const requestedDate = report.requestedDate;
  const datedPath = join(stateDirectory, reportFilename(requestedDate));
  const proofPath = join(stateDirectory, proofFilename(requestedDate));
  const datedBytes = readFileSync(datedPath);
  if (!latestBytes.equals(datedBytes)) {
    fail("legacy latest report does not exactly match its dated publication");
  }
  const { proof } = validateProof(
    parseJson(readFileSync(proofPath), proofPath),
    requestedDate,
  );
  validateLegacyPublicationBinding(
    report,
    proof,
    requestedDate,
    latestBytes.byteLength,
    sha256Hex(latestBytes),
  );
  return { proofPath, requestedDate };
}

function buildState(expectedDate, bindingPath, complete) {
  const bytes = readFileSync(bindingPath);
  const artifact = parseJson(bytes, bindingPath);
  return createState(
    expectedDate, basename(bindingPath), bytes.byteLength, sha256Hex(bytes),
    complete, artifact,
  );
}

function validateBinding(state, path) {
  const expected = buildState(
    state.requestedDate,
    path,
    state.state === "complete",
  );
  if (stableJson(expected) !== stableJson(state)) {
    fail("day state binding is stale or conflicting");
  }
}

function writeState(path, state) {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

function stateFilename(date) {
  return `reader-summary-production-day-state.${date}.v1.json`;
}

function parseOptions(args) {
  const result = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name === undefined || value === undefined || !name.startsWith("--")) {
      fail("state verifier options must be --name value pairs");
    }
    if (result.has(name)) fail(`duplicate option: ${name}`);
    result.set(name, value);
  }
  return result;
}

function assertOnlyOptions(values, allowed) {
  for (const name of values.keys()) {
    if (!allowed.includes(name)) fail(`unsupported option: ${name}`);
  }
}

function requiredOption(values, name) {
  const value = values.get(name);
  if (value === undefined || value.length === 0) {
    fail(`missing required option: ${name}`);
  }
  return value;
}

function parseJson(bytes, path) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${path} is not valid JSON`);
  }
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

