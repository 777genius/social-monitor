import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const verifier = join(
  process.cwd(),
  "scripts/verify-reader-summary-production-day-state.mjs",
);
const collectionDate = "2026-07-27";

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

function run(args) {
  const result = spawnSync(process.execPath, [verifier, ...args], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function assertFailure(args) {
  const result = spawnSync(process.execPath, [verifier, ...args], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, "expected verifier failure");
}

function withFixture(runTest) {
  const directory = mkdtempSync(join(tmpdir(), "daily-state-verifier-"));
  try {
    runTest(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
