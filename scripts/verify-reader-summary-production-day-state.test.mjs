import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import * as ts from "typescript";

const verifier = fileURLToPath(
  new URL("./verify-reader-summary-production-day-state.mjs", import.meta.url),
);
const collectionDate = "2026-07-27";

test("CLI delegates every state/proof/outcome path to the pure validation owner", () => {
  const script = ts.createSourceFile(
    "production-day-cli.mjs", readFileSync(verifier, "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS,
  );
  const policyPath = fileURLToPath(
    new URL("./lib/reader-summary-production-day-state-validation.mjs", import.meta.url),
  );
  const policy = ts.createSourceFile(
    "production-day-policy.mjs", readFileSync(policyPath, "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS,
  );
  const policyImport = script.statements.find((statement) =>
    ts.isImportDeclaration(statement) &&
    statement.moduleSpecifier.text === "./lib/reader-summary-production-day-state-validation.mjs");
  assert.ok(policyImport, "CLI must import the extracted validation policy");
  const bindings = policyImport.importClause?.namedBindings;
  assert.ok(bindings && ts.isNamedImports(bindings), "CLI must import policy functions by name");
  const imported = new Set(bindings.elements.map((element) => element.name.text));
  function countExecutableCalls(source) {
    const calls = new Map();
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        calls.set(name, (calls.get(name) ?? 0) + 1);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    return calls;
  }
  const cliCalls = countExecutableCalls(script);
  const policyCalls = countExecutableCalls(policy);
  assert.ok(imported.has("createState"), "CLI must delegate state construction to policy");
  assert.equal(cliCalls.get("createState"), 1, "CLI must call state constructor once");
  assert.equal(
    policy.statements.filter((node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === "createState").length,
    1, "policy must own the state constructor exactly once",
  );
  // Preserve six distinct executable admission paths across the two owners.
  for (const [name, expectedCliCalls, expectedPolicyCalls] of [
    ["validateState", 3, 0],    // latest, dated and direct state verification
    ["validateProof", 1, 1],    // legacy proof and policy state construction
    ["validateOutcome", 0, 1],  // outcome admission now belongs to policy
  ]) {
    assert.equal(
      imported.has(name), expectedCliCalls > 0,
      name + " should only be directly imported when the CLI calls it",
    );
    assert.equal(
      script.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).length,
      0, name + " must not be duplicated in the CLI",
    );
    assert.equal(
      policy.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).length,
      1, name + " must have exactly one policy implementation",
    );
    assert.equal(cliCalls.get(name) ?? 0, expectedCliCalls, name + " CLI admission paths changed");
    assert.equal(policyCalls.get(name) ?? 0, expectedPolicyCalls, name + " policy admission paths changed");
  }
});

test("creates deterministic complete state bound to a verified proof", () => {
  withFixture((directory) => {
    const proofPath = writeProof(directory, collectionDate);
    const first = join(directory, "first-state.json");
    const second = join(directory, "second-state.json");
    buildCompleteState(proofPath, first, collectionDate);
    buildCompleteState(proofPath, second, collectionDate);
    assert.deepEqual(readFileSync(first), readFileSync(second));
    const state = JSON.parse(readFileSync(first, "utf8"));
    assert.equal(state.state, "complete");
    assert.equal(
      state.binding.sha256,
      createHash("sha256").update(readFileSync(proofPath)).digest("hex"),
    );
  });
});

test("CLI preserves an existing immutable cursor for proof, outcome, and legacy migration", () => {
  for (const kind of ["proof", "outcome", "legacy"]) {
    withFixture((directory) => {
      const stateOut = join(directory, "existing-state.json");
      const original = `previous immutable state: ${kind}\n`;
      writeFileSync(stateOut, original);
      let args;
      if (kind === "legacy") {
        const date = "2026-07-22";
        const latest = writeLegacyPublication(directory, date);
        args = [
          "--legacy-latest", latest,
          "--state-dir", directory,
          "--state-out", stateOut,
        ];
      } else {
        const binding = kind === "proof"
          ? writeProof(directory, collectionDate)
          : writeOutcome(directory, collectionDate, "partial");
        args = [
          "--expected-date", collectionDate,
          kind === "proof" ? "--publication-proof" : "--terminal-outcome", binding,
          "--state-out", stateOut,
        ];
      }
      const rejected = assertFailure(args);
      assert.match(rejected.stderr, /EEXIST/, `${kind}: must reject existing output`);
      assert.equal(readFileSync(stateOut, "utf8"), original, `${kind}: original bytes must survive`);
    });
  }
});

for (const outcome of ["partial", "unavailable"]) {
  test(`creates and verifies immutable ${outcome} state`, () => {
    withFixture((directory) => {
      const outcomePath = writeOutcome(directory, collectionDate, outcome);
      const statePath = join(directory, "state.json");
      run([
        "--expected-date",
        collectionDate,
        "--terminal-outcome",
        outcomePath,
        "--state-out",
        statePath,
      ]);
      run([
        "--expected-date",
        collectionDate,
        "--terminal-outcome",
        outcomePath,
        "--state",
        statePath,
      ]);
      assert.equal(
        JSON.parse(readFileSync(statePath, "utf8")).state,
        outcome,
      );
    });
  });
}

test("verifies latest only through dated state and bound artifact", () => {
  withFixture((directory) => {
    const proofPath = writeProof(directory, collectionDate);
    const datedState = join(directory, stateFilename(collectionDate));
    buildCompleteState(proofPath, datedState, collectionDate);
    const latest = join(directory, "latest-state.v1.json");
    cpSync(datedState, latest);
    assert.equal(
      run(["--dated-state", datedState, "--state-dir", directory]).stdout,
      collectionDate,
    );
    assert.equal(
      run(["--latest-state", latest, "--state-dir", directory]).stdout,
      collectionDate,
    );

    writeFileSync(join(directory, "latest.v1.json"), "{ignored legacy\n");
    assert.equal(
      run(["--latest-state", latest, "--state-dir", directory]).stdout,
      collectionDate,
    );
  });
});

test("legacy Jul22 publication bootstraps exact completed cursor", () => {
  withFixture((directory) => {
    const legacyDate = "2026-07-22";
    const latest = writeLegacyPublication(directory, legacyDate);
    const migrated = join(directory, "migrated-state.json");
    const result = run([
      "--legacy-latest",
      latest,
      "--state-dir",
      directory,
      "--state-out",
      migrated,
    ]);
    assert.equal(result.stdout, legacyDate);
    const state = JSON.parse(readFileSync(migrated, "utf8"));
    assert.equal(state.requestedDate, legacyDate);
    assert.equal(state.state, "complete");
    assert.equal(
      state.binding.filename,
      `reader-summary-production-day-run.${legacyDate}.publication-proof.v1.json`,
    );
  });
});

test("legacy publication rejects failed quality gate even with matching immutable bytes and proof", () => {
  withFixture((directory) => {
    const legacyDate = "2026-07-22";
    const latest = writeLegacyPublication(directory, legacyDate);
    const report = JSON.parse(readFileSync(latest, "utf8"));
    report.qualityGates.productionDefinitionOfDoneSatisfied = false;
    const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(latest, bytes);
    writeFileSync(join(directory, reportFilename(legacyDate)), bytes);
    const proofPath = join(directory, proofFilename(legacyDate));
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    proof.reportByteLength = bytes.byteLength;
    proof.reportSha256 = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(proofPath, `${JSON.stringify(proof)}\n`);
    const rejected = assertFailure([
      "--legacy-latest", latest,
      "--state-dir", directory,
      "--state-out", join(directory, "rejected-state.json"),
    ]);
    assert.match(rejected.stderr, /legacy latest report is not a verified completed publication/);
  });
});

test("malformed or inconsistent legacy publication fails closed", () => {
  withFixture((directory) => {
    const latest = join(directory, "latest.v1.json");
    writeFileSync(latest, "{broken\n");
    assertFailure([
      "--legacy-latest",
      latest,
      "--state-dir",
      directory,
      "--state-out",
      join(directory, "malformed-state.json"),
    ]);
  });
  withFixture((directory) => {
    const legacyDate = "2026-07-22";
    const latest = writeLegacyPublication(directory, legacyDate);
    const proofPath = join(directory, proofFilename(legacyDate));
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    proof.evidenceArtifactSha256 = "9".repeat(64);
    writeFileSync(proofPath, `${JSON.stringify(proof)}\n`);
    assertFailure([
      "--legacy-latest",
      latest,
      "--state-dir",
      directory,
      "--state-out",
      join(directory, "inconsistent-state.json"),
    ]);
  });
});

test("malformed, stale, and conflicting latest states fail closed", () => {
  withFixture((directory) => {
    const proofPath = writeProof(directory, collectionDate);
    const datedState = join(directory, stateFilename(collectionDate));
    buildCompleteState(proofPath, datedState, collectionDate);
    const latest = join(directory, "latest-state.v1.json");

    writeFileSync(latest, "{broken\n");
    assertFailure(["--latest-state", latest, "--state-dir", directory]);

    const stale = JSON.parse(readFileSync(datedState, "utf8"));
    stale.requestedDate = "2026-07-26";
    stale.binding.filename = proofFilename("2026-07-26");
    writeFileSync(latest, `${JSON.stringify(stale)}\n`);
    assertFailure(["--latest-state", latest, "--state-dir", directory]);

    cpSync(datedState, latest);
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    proof.reportSha256 = "8".repeat(64);
    writeFileSync(proofPath, `${JSON.stringify(proof)}\n`);
    assertFailure(["--latest-state", latest, "--state-dir", directory]);
  });
});

test("immutable cursor checks bind raw artifact and dated-state bytes, not only parsed JSON", () => {
  withFixture((directory) => {
    const proofPath = writeProof(directory, collectionDate);
    const datedState = join(directory, stateFilename(collectionDate));
    buildCompleteState(proofPath, datedState, collectionDate);
    const latestState = join(directory, "latest-state.v1.json");
    cpSync(datedState, latestState);

    // Preserve exact latest-vs-dated byte equality even when both parse identically.
    chmodSync(latestState, 0o644);
    writeFileSync(latestState, Buffer.concat([
      readFileSync(latestState), Buffer.from("\n"),
    ]));
    const modifiedLatest = assertFailure([
      "--latest-state", latestState, "--state-dir", directory,
    ]);
    assert.match(modifiedLatest.stderr, /latest state does not exactly match its immutable dated state/);

    // Restore the cursor, then change only proof whitespace. All three
    // read paths must reject the stale byteLength/SHA-256 binding.
    cpSync(datedState, latestState);
    writeFileSync(proofPath, Buffer.concat([
      readFileSync(proofPath), Buffer.from("\n"),
    ]));
    for (const args of [
      ["--expected-date", collectionDate, "--publication-proof", proofPath, "--state", datedState],
      ["--dated-state", datedState, "--state-dir", directory],
      ["--latest-state", latestState, "--state-dir", directory],
    ]) {
      const rejected = assertFailure(args);
      assert.match(
        rejected.stderr,
        /day state (does not exactly bind its verified terminal artifact|binding is stale or conflicting)/,
      );
    }
  });
});

test("dated and direct state checks reject invalid terminal identity", () => {
  withFixture((directory) => {
    const proofPath = writeProof(directory, collectionDate);
    const datedState = join(directory, stateFilename(collectionDate));
    buildCompleteState(proofPath, datedState, collectionDate);

    const invalid = JSON.parse(readFileSync(datedState, "utf8"));
    invalid.terminal = false;
    // The CLI writes this fixture 0444; explicitly grant write access to model tampering.
    chmodSync(datedState, 0o644);
    writeFileSync(datedState, `${JSON.stringify(invalid)}\n`);

    const dated = assertFailure([
      "--dated-state", datedState, "--state-dir", directory,
    ]);
    assert.match(dated.stderr, /day state identity or terminal status is invalid/);

    const direct = assertFailure([
      "--expected-date", collectionDate,
      "--publication-proof", proofPath,
      "--state", datedState,
    ]);
    assert.match(direct.stderr, /day state identity or terminal status is invalid/);
  });
});

test("terminal outcome must prove no model, publication, or recollection", () => {
  withFixture((directory) => {
    const outcomePath = writeOutcome(directory, collectionDate, "partial");
    const outcome = JSON.parse(readFileSync(outcomePath, "utf8"));
    outcome.boundaries.summaryPublished = true;
    writeFileSync(outcomePath, `${JSON.stringify(outcome)}\n`);
    assertFailure([
      "--expected-date",
      collectionDate,
      "--terminal-outcome",
      outcomePath,
      "--state-out",
      join(directory, "state.json"),
    ]);
  });
});

test("terminal incomplete providers require a diagnostic reason", () => {
  withFixture((directory) => {
    const outcomePath = writeOutcome(directory, collectionDate, "partial");
    const outcome = JSON.parse(readFileSync(outcomePath, "utf8"));
    outcome.providerReadiness.providers[1].reasonCodes = [];
    writeFileSync(outcomePath, `${JSON.stringify(outcome)}\n`);
    assertFailure([
      "--expected-date",
      collectionDate,
      "--terminal-outcome",
      outcomePath,
      "--state-out",
      join(directory, "state.json"),
    ]);
  });
});

test("real verifier works from a non-repository working directory", () => {
  withFixture((directory) => {
    const proofPath = writeProof(directory, collectionDate);
    const statePath = join(directory, "foreign-cwd-state.json");
    run([
      "--expected-date", collectionDate,
      "--publication-proof", proofPath,
      "--state-out", statePath,
    ], { cwd: directory });
    run([
      "--expected-date", collectionDate,
      "--publication-proof", proofPath,
      "--state", statePath,
    ], { cwd: directory });
    assert.equal(JSON.parse(readFileSync(statePath, "utf8")).state, "complete");
  });
});

test("real verifier rejects malformed proof policy after extraction", () => {
  for (const corrupt of [
    (proof) => { proof.requestedUtcPeriod.endedAt = "2026-07-29T00:00:00.000Z"; },
    (proof) => { proof.qualityGateNames.push(proof.qualityGateNames[0]); },
    (proof) => { proof.reportSha256 = "z".repeat(64); },
  ]) {
    withFixture((directory) => {
      const proofPath = writeProof(directory, collectionDate);
      const proof = JSON.parse(readFileSync(proofPath, "utf8"));
      corrupt(proof);
      writeFileSync(proofPath, `${JSON.stringify(proof)}\n`);
      assertFailure([
        "--expected-date", collectionDate,
        "--publication-proof", proofPath,
        "--state-out", join(directory, "rejected-state.json"),
      ]);
    });
  }
});

test("real verifier rejects conflicting provider diagnostics after extraction", () => {
  for (const corrupt of [
    (outcome) => { outcome.providerReadiness.providers[1].providerKey = "hacker-news"; },
    (outcome) => { outcome.providerReadiness.providers[1].databaseFeedItemCount = -1; },
    (outcome) => { outcome.outcome = "unavailable"; },
  ]) {
    withFixture((directory) => {
      const outcomePath = writeOutcome(directory, collectionDate, "partial");
      const outcome = JSON.parse(readFileSync(outcomePath, "utf8"));
      corrupt(outcome);
      writeFileSync(outcomePath, `${JSON.stringify(outcome)}\n`);
      assertFailure([
        "--expected-date", collectionDate,
        "--terminal-outcome", outcomePath,
        "--state-out", join(directory, "rejected-state.json"),
      ]);
    });
  }
});

function writeLegacyPublication(directory, date) {
  const period = utcPeriod(date);
  const captureExecution = {
    executionId: "55555555-5555-4555-8555-555555555555",
    startedAt: `${date}T01:00:00.000Z`,
    completedAt: `${date}T01:01:00.000Z`,
    frontendArtifactSha256: "3".repeat(64),
    frontendArtifactByteLength: 103,
  };
  const runtimeProvenance = {
    execution: "attested",
    provider: "codex",
  };
  const binding = {
    artifactId: "durable-reader-summary-postgres-evidence-v1",
    sha256: "2".repeat(64),
    byteLength: 102,
    readerSummaryId: "11111111-1111-4111-8111-111111111111",
    readerSummaryJobId: "22222222-2222-4222-8222-222222222222",
    requestedUtcPeriod: period,
    captureExecution,
    runtimeProvenance,
  };
  const report = {
    schemaVersion: 1,
    artifactFormat: "reader-summary-production-day-run-v1",
    generatedBy: "npm run run:reader-summary-production-day",
    requestedDate: date,
    collectionDate: date,
    reportIdentity: {
      artifactId: `reader-summary-production-day-run-v1/${date}/fixture`,
      requestedDate: date,
      requestedUtcPeriod: period,
    },
    provenance: {
      requestedUtcPeriod: period,
      collectionUtcPeriod: period,
      sourceEvidence: binding,
    },
    failure: null,
    qualityGates: {
      evidenceArtifactContentHashBound: true,
      productionDefinitionOfDoneSatisfied: true,
    },
    blockingPassed: true,
  };
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  const datedPath = join(directory, reportFilename(date));
  const latestPath = join(directory, "latest.v1.json");
  writeFileSync(datedPath, bytes);
  writeFileSync(latestPath, bytes);
  writeProof(directory, date, {
    report,
    reportBytes: bytes,
    binding,
  });
  return latestPath;
}

function writeProof(directory, date, legacy) {
  const period = utcPeriod(date);
  const binding = legacy?.binding ?? {
    artifactId: "durable-reader-summary-postgres-evidence-v1",
    sha256: "2".repeat(64),
    byteLength: 102,
    readerSummaryId: "11111111-1111-4111-8111-111111111111",
    readerSummaryJobId: "22222222-2222-4222-8222-222222222222",
    requestedUtcPeriod: period,
    captureExecution: {
      executionId: "55555555-5555-4555-8555-555555555555",
      frontendArtifactSha256: "3".repeat(64),
      frontendArtifactByteLength: 103,
    },
    runtimeProvenance: { execution: "attested", provider: "codex" },
  };
  const path = join(directory, proofFilename(date));
  const proof = {
    schemaVersion: 1,
    artifactFormat: "reader-summary-production-day-publication-proof-v1",
    collectionDate: date,
    reportFilename: reportFilename(date),
    reportByteLength: legacy?.reportBytes.byteLength ?? 101,
    reportSha256:
      legacy === undefined
        ? "1".repeat(64)
        : createHash("sha256").update(legacy.reportBytes).digest("hex"),
    reportArtifactId:
      legacy?.report.reportIdentity.artifactId ?? "fixture/report",
    evidenceArtifactId: binding.artifactId,
    evidenceArtifactSha256: binding.sha256,
    evidenceArtifactByteLength: binding.byteLength,
    frontendArtifactSha256:
      binding.captureExecution.frontendArtifactSha256,
    frontendArtifactByteLength:
      binding.captureExecution.frontendArtifactByteLength,
    captureExecution: binding.captureExecution,
    readerSummaryId: binding.readerSummaryId,
    readerSummaryJobId: binding.readerSummaryJobId,
    requestedUtcPeriod: period,
    model: binding.runtimeProvenance,
    qualityGateNames:
      legacy === undefined
        ? ["fixtureBlockingQualityPassed"]
        : Object.keys(legacy.report.qualityGates).sort(),
    blockingPassed: true,
  };
  writeFileSync(path, `${JSON.stringify(proof)}\n`);
  return path;
}

function writeOutcome(directory, date, outcome) {
  const path = join(directory, outcomeFilename(date));
  writeFileSync(
    path,
    `${JSON.stringify({
      schemaVersion: 1,
      artifactFormat: "reader-summary-production-day-outcome-v1",
      generatedBy: "npm run run:reader-summary-production-day",
      generatedAt: `${date}T01:01:00.000Z`,
      requestedDate: date,
      outcome,
      terminal: true,
      reason:
        outcome === "partial"
          ? "bounded_provider_shortfall"
          : "verified_provider_unavailability",
      boundaries: {
        summaryModelCalled: false,
        topicModelCalled: false,
        summaryPublished: false,
        recollectionPerformedByOutcome: false,
      },
      providerReadiness: {
        diagnosticsOwner: "postgres_feed_items_published_window",
        providers: [
          {
            providerKey: "hacker-news",
            state: "complete",
            evidence: "live_collection",
            databaseFeedItemCount: 100,
            collectionFeedItemCount: 100,
            minimumFeedItemCount: 70,
            reasonCodes: [],
          },
          {
            providerKey: "reddit",
            state: outcome,
            evidence:
              outcome === "partial" ? "live_collection" : "explicit_unavailable",
            databaseFeedItemCount: outcome === "partial" ? 45 : 0,
            collectionFeedItemCount: outcome === "partial" ? 45 : 0,
            minimumFeedItemCount: 50,
            reasonCodes:
              outcome === "partial"
                ? ["target_shortfall"]
                : ["provider_unavailable"],
          },
        ],
      },
    }, null, 2)}\n`,
  );
  return path;
}

function buildCompleteState(proofPath, statePath, date) {
  run([
    "--expected-date",
    date,
    "--publication-proof",
    proofPath,
    "--state-out",
    statePath,
  ]);
}

function utcPeriod(date) {
  const startedAt = `${date}T00:00:00.000Z`;
  const end = new Date(startedAt);
  end.setUTCDate(end.getUTCDate() + 1);
  const endedAt = end.toISOString();
  return {
    cadence: "daily",
    startedAt,
    endedAt,
    timezone: "UTC",
    periodKey: `daily:${startedAt}:${endedAt}:UTC`,
  };
}

function reportFilename(date) {
  return `reader-summary-production-day-run.${date}.v1.json`;
}

function proofFilename(date) {
  return `reader-summary-production-day-run.${date}.publication-proof.v1.json`;
}

function stateFilename(date) {
  return `reader-summary-production-day-state.${date}.v1.json`;
}

function outcomeFilename(date) {
  return `reader-summary-production-day-outcome.${date}.v1.json`;
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [verifier, ...args], {
    cwd: options.cwd,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function assertFailure(args) {
  const result = spawnSync(process.execPath, [verifier, ...args], {
    encoding: "utf8",
  });
  assert.ifError(result.error);
  assert.ok(
    Number.isInteger(result.status) && result.status !== 0,
    `expected a rejected verifier exit, got status=${result.status} signal=${result.signal}; stderr=${result.stderr}`,
  );
  return result;
}

function withFixture(runTest) {
  const directory = mkdtempSync(join(tmpdir(), "daily-state-verifier-"));
  try {
    runTest(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
