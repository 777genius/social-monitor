import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { canonicalizeReaderSummaryWeeklyJson } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  commitReaderSummaryWeeklyArtifactPair,
  inspectOrRecoverReaderSummaryWeeklyArtifactPair,
  readerSummaryWeeklyArtifactPairInterruptionPoints,
  readerSummaryWeeklyArtifactPairPaths,
  type ReaderSummaryWeeklyArtifactPairInterruptionPoint,
  type ReaderSummaryWeeklyArtifactPairValidation,
} from "./reader-summary-weekly-production-artifact-pair";

describe("reader summary weekly production artifact pair", () => {
  it("commits canonical read-only bytes and replays the exact pair idempotently", () => {
    const fixture = pairFixture();

    expect(commit(fixture)).toBe(true);

    expect(readFileSync(fixture.paths.artifactPath)).toEqual(
      Buffer.from(canonicalizeReaderSummaryWeeklyJson(fixture.artifact).toBytes()),
    );
    expect(readFileSync(fixture.paths.proofPath)).toEqual(
      Buffer.from(canonicalizeReaderSummaryWeeklyJson(fixture.proof).toBytes()),
    );
    expect(statSync(fixture.paths.artifactPath).mode & 0o777).toBe(0o444);
    expect(statSync(fixture.paths.proofPath).mode & 0o777).toBe(0o444);
    expect(existsSync(fixture.paths.pendingPairPath)).toBe(false);
    expect(commit(fixture)).toBe(false);
  });

  it.each(readerSummaryWeeklyArtifactPairInterruptionPoints)(
    "recovers or retries after interruption at %s",
    (interruptionPoint) => {
      const fixture = pairFixture();

      expect(() =>
        commitReaderSummaryWeeklyArtifactPair({
          ...fixture,
          checkpoint: (point) => {
            if (point === interruptionPoint) {
              throw new Error(`interrupted:${point}`);
            }
          },
        }),
      ).toThrow(`interrupted:${interruptionPoint}`);

      if (
        interruptionPoint === "artifact_published" ||
        interruptionPoint === "artifact_directory_entry_synced" ||
        interruptionPoint === "proof_publish_started" ||
        interruptionPoint === "proof_published" ||
        interruptionPoint === "proof_directory_entry_synced"
      ) {
        expect(existsSync(fixture.paths.artifactPath)).toBe(false);
        expect(existsSync(fixture.paths.proofPath)).toBe(false);
        expect(existsSync(fixture.paths.pendingPairPath)).toBe(true);
      }

      expect(() => commit(fixture)).not.toThrow();
      expect(validState(fixture).status).toBe("valid");
      expect(existsSync(fixture.paths.pendingPairPath)).toBe(false);
    },
  );

  it.each(readerSummaryWeeklyArtifactPairInterruptionPoints)(
    "recovers or retries after true process death at %s",
    (interruptionPoint) => {
      const fixture = pairFixture();

      crashCommit(fixture, interruptionPoint);

      expect(() => commit(fixture)).not.toThrow();
      expect(validState(fixture).status).toBe("valid");
      expect(existsSync(fixture.paths.pendingPairPath)).toBe(false);
      expect(cleanupTombstones(fixture)).toHaveLength(0);
    },
  );

  it("recovers after true process death between public links", () => {
    const fixture = pairFixture();
    crashCommit(fixture, "artifact_published");

    expect(existsSync(fixture.paths.artifactPath)).toBe(true);
    expect(existsSync(fixture.paths.proofPath)).toBe(false);
    expect(existsSync(fixture.paths.pendingPairPath)).toBe(true);

    const state = validState(fixture);

    expect(state.status).toBe("valid");
    expect(existsSync(fixture.paths.artifactPath)).toBe(true);
    expect(existsSync(fixture.paths.proofPath)).toBe(true);
    expect(existsSync(fixture.paths.pendingPairPath)).toBe(false);
  });

  it.each([
    "pending_cleanup_tombstone_published",
    "pending_cleanup_parent_synced",
    "pending_cleanup_remove_started",
    "pending_pair_removed",
  ] as const)(
    "recovers after true process death during pending cleanup at %s",
    (interruptionPoint) => {
      const fixture = pairFixture();
      crashCommit(fixture, interruptionPoint);

      expect(existsSync(fixture.paths.artifactPath)).toBe(true);
      expect(existsSync(fixture.paths.proofPath)).toBe(true);
      expect(existsSync(fixture.paths.pendingPairPath)).toBe(false);
      expect(cleanupTombstones(fixture)).toHaveLength(
        interruptionPoint === "pending_pair_removed" ? 0 : 1,
      );

      expect(validState(fixture).status).toBe("valid");
      expect(cleanupTombstones(fixture)).toHaveLength(0);
    },
  );

  it("recovers after true process death during first output directory creation", () => {
    const fixture = pairFixture();
    expect(existsSync(fixture.paths.outputDirectory)).toBe(false);

    crashCommit(fixture, "output_directory_created");

    expect(existsSync(fixture.paths.outputDirectory)).toBe(true);
    expect(existsSync(fixture.paths.artifactPath)).toBe(false);
    expect(existsSync(fixture.paths.proofPath)).toBe(false);

    expect(commit(fixture)).toBe(true);
    expect(validState(fixture).status).toBe("valid");
  });

  it.each(["artifact", "proof"] as const)(
    "rejects an incomplete legacy pair with only the %s and preserves it",
    (present) => {
      const fixture = pairFixture();
      mkdirSync(fixture.paths.outputDirectory, { recursive: true });
      const path =
        present === "artifact"
          ? fixture.paths.artifactPath
          : fixture.paths.proofPath;
      const value = present === "artifact" ? fixture.artifact : fixture.proof;
      writeCanonical(path, value);

      expect(() => validState(fixture)).toThrow(
        `legacy artifact/proof pair is incomplete: ${present} exists without a recoverable pair seal`,
      );
      expect(readFileSync(path)).toEqual(
        Buffer.from(canonicalizeReaderSummaryWeeklyJson(value).toBytes()),
      );
    },
  );

  it("does not overwrite a divergent complete pair", () => {
    const fixture = pairFixture();
    commit(fixture);
    const originalArtifact = readFileSync(fixture.paths.artifactPath);
    const divergent = pairFixture(fixture.paths.outputDirectory, "different");

    expect(() => commit(divergent)).toThrow(
      /refuses to overwrite divergent data/u,
    );
    expect(readFileSync(fixture.paths.artifactPath)).toEqual(originalArtifact);
    expect(existsSync(fixture.paths.pendingPairPath)).toBe(false);
  });

  it("replays an exact complete pair from the legacy pretty-byte encoding", () => {
    const fixture = pairFixture();
    mkdirSync(fixture.paths.outputDirectory, { recursive: true });
    writeFileSync(
      fixture.paths.artifactPath,
      `${JSON.stringify(fixture.artifact, null, 2)}\n`,
      { flag: "wx", mode: 0o444 },
    );
    writeFileSync(
      fixture.paths.proofPath,
      `${JSON.stringify(fixture.proof, null, 2)}\n`,
      { flag: "wx", mode: 0o444 },
    );

    expect(validState(fixture).status).toBe("valid");
    expect(existsSync(fixture.paths.pendingPairPath)).toBe(false);
  });

  it("does not overwrite divergent public data while recovering a pending pair", () => {
    const fixture = pairFixture();
    leavePendingPair(fixture);
    writeCanonical(fixture.paths.artifactPath, { divergent: true });
    const divergentBytes = readFileSync(fixture.paths.artifactPath);

    expect(() => validState(fixture)).toThrow(
      /refuses to overwrite divergent data/u,
    );
    expect(readFileSync(fixture.paths.artifactPath)).toEqual(divergentBytes);
    expect(existsSync(fixture.paths.proofPath)).toBe(false);
    expect(existsSync(fixture.paths.pendingPairPath)).toBe(true);
  });

  it("rolls back only links created by the interrupted publish attempt", () => {
    const fixture = pairFixture();
    leavePendingPair(fixture);
    linkSync(
      join(fixture.paths.pendingPairPath, "artifact.json"),
      fixture.paths.artifactPath,
    );
    const preexistingArtifact = readFileSync(fixture.paths.artifactPath);

    expect(() =>
      inspectOrRecoverReaderSummaryWeeklyArtifactPair({
        ...fixture,
        checkpoint: (point) => {
          if (point === "proof_published") {
            throw new Error("interrupted recovery publish");
          }
        },
      }),
    ).toThrow("interrupted recovery publish");

    expect(readFileSync(fixture.paths.artifactPath)).toEqual(
      preexistingArtifact,
    );
    expect(existsSync(fixture.paths.proofPath)).toBe(false);
    expect(existsSync(fixture.paths.pendingPairPath)).toBe(true);
    expect(validState(fixture).status).toBe("valid");
  });

  it("rejects non-canonical published bytes even when their JSON value matches", () => {
    const fixture = pairFixture();
    commit(fixture);
    chmodSync(fixture.paths.proofPath, 0o644);
    writeFileSync(
      fixture.paths.proofPath,
      `${readFileSync(fixture.paths.proofPath, "utf8")}\n`,
    );

    expect(() => validState(fixture)).toThrow(/not exact canonical bytes/u);
  });

  it("rejects a pending pair whose exact SHA seal was changed", () => {
    const fixture = pairFixture();
    leavePendingPair(fixture);
    const sealPath = join(fixture.paths.pendingPairPath, "pair-seal.json");
    const seal = JSON.parse(readFileSync(sealPath, "utf8")) as Record<
      string,
      unknown
    >;
    chmodSync(sealPath, 0o644);
    writeCanonical(sealPath, { ...seal, proofSha256: "0".repeat(64) }, "w");

    expect(() => validState(fixture)).toThrow(/pair seal is invalid/u);
    expect(existsSync(fixture.paths.artifactPath)).toBe(false);
    expect(existsSync(fixture.paths.proofPath)).toBe(false);
  });
});

type PairFixture = ReturnType<typeof pairFixture>;

function pairFixture(
  outputDirectory = join(
    mkdtempSync(join(tmpdir(), "weekly-artifact-pair-")),
    "output",
  ),
  value = "expected",
) {
  const artifact = Object.freeze({
    schemaVersion: "test.artifact.v1",
    value,
  });
  const artifactSha256 =
    canonicalizeReaderSummaryWeeklyJson(artifact).sha256;
  const proof = Object.freeze({
    schemaVersion: "test.proof.v1",
    artifactSha256,
  });
  return {
    paths: readerSummaryWeeklyArtifactPairPaths(
      outputDirectory,
      "2026-07-20",
    ),
    artifact,
    proof,
    validate: validatePair,
  };
}

function validatePair(
  artifactValue: unknown,
  proofValue: unknown,
  validation: ReaderSummaryWeeklyArtifactPairValidation,
): void {
  const artifact = artifactValue as { schemaVersion?: unknown };
  const proof = proofValue as {
    schemaVersion?: unknown;
    artifactSha256?: unknown;
  };
  if (
    artifact.schemaVersion !== "test.artifact.v1" ||
    proof.schemaVersion !== "test.proof.v1" ||
    proof.artifactSha256 !== validation.artifactSha256
  ) {
    throw new Error("Test artifact pair is invalid");
  }
}

function commit(fixture: PairFixture): boolean {
  return commitReaderSummaryWeeklyArtifactPair(fixture);
}

function validState(fixture: PairFixture) {
  return inspectOrRecoverReaderSummaryWeeklyArtifactPair(fixture);
}

function leavePendingPair(fixture: PairFixture): void {
  expect(() =>
    commitReaderSummaryWeeklyArtifactPair({
      ...fixture,
      checkpoint: (point) => {
        if (point === "pending_pair_published") {
          throw new Error("simulated process death");
        }
      },
    }),
  ).toThrow("simulated process death");
  expect(existsSync(fixture.paths.pendingPairPath)).toBe(true);
}

function crashCommit(
  fixture: PairFixture,
  interruptionPoint: ReaderSummaryWeeklyArtifactPairInterruptionPoint,
): void {
  const child = spawnSync(
    process.execPath,
    [
      "--require",
      "ts-node/register/transpile-only",
      "--eval",
      processDeathCommitScript,
      fixture.paths.outputDirectory,
      fixture.artifact.value,
      interruptionPoint,
    ],
    {
      cwd: join(__dirname, "../.."),
      encoding: "utf8",
      env: {
        ...process.env,
        TS_NODE_COMPILER_OPTIONS: JSON.stringify({ rootDir: "." }),
      },
    },
  );
  if (child.error !== undefined) {
    throw child.error;
  }
  expect({
    status: child.status,
    signal: child.signal,
    stderr: child.stderr,
  }).toEqual({
    status: 86,
    signal: null,
    stderr: "",
  });
}

function cleanupTombstones(fixture: PairFixture): string[] {
  if (!existsSync(fixture.paths.outputDirectory)) {
    return [];
  }
  const prefix = `${basename(fixture.paths.pendingPairPath)}.`;
  return readdirSync(fixture.paths.outputDirectory).filter(
    (name) => name.startsWith(prefix) && name.endsWith(".cleanup"),
  );
}

function writeCanonical(
  path: string,
  value: unknown,
  flag: "w" | "wx" = "wx",
): void {
  writeFileSync(
    path,
    canonicalizeReaderSummaryWeeklyJson(value).toBytes(),
    { flag, mode: 0o444 },
  );
}

const processDeathCommitScript = `
const {
  commitReaderSummaryWeeklyArtifactPair,
  readerSummaryWeeklyArtifactPairPaths,
} = require("./scripts/lib/reader-summary-weekly-production-artifact-pair");
const {
  canonicalizeReaderSummaryWeeklyJson,
} = require("./libs/summary/domain/value-objects/reader-summary-weekly-canonical-json");
const [outputDirectory, value, interruptionPoint] = process.argv.slice(1);
const artifact = Object.freeze({
  schemaVersion: "test.artifact.v1",
  value,
});
const proof = Object.freeze({
  schemaVersion: "test.proof.v1",
  artifactSha256: canonicalizeReaderSummaryWeeklyJson(artifact).sha256,
});
commitReaderSummaryWeeklyArtifactPair({
  paths: readerSummaryWeeklyArtifactPairPaths(outputDirectory, "2026-07-20"),
  artifact,
  proof,
  validate: (artifactValue, proofValue, validation) => {
    if (
      artifactValue.schemaVersion !== "test.artifact.v1" ||
      proofValue.schemaVersion !== "test.proof.v1" ||
      proofValue.artifactSha256 !== validation.artifactSha256
    ) {
      throw new Error("Child artifact pair is invalid");
    }
  },
  checkpoint: (point) => {
    if (point === interruptionPoint) {
      process.exit(86);
    }
  },
});
`;
