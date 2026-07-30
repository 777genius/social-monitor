import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  openRecoveryTerminalImmutableSource,
  publishRecoveryTerminalImmutableManifest,
} from "./reader-summary-recovery-terminal-manifest-filesystem";

describe("recovery terminal manifest trusted filesystem", () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it("publishes immutable bytes once and replays exact bytes", () => {
    const outputPath = fixtureOutputPath();
    const bytes = Buffer.from('{"value":"exact"}\n');
    const manifest = Object.freeze({ value: "exact" });
    const params = {
      outputPath,
      bytes,
      manifest,
      parseAndValidate: parseFixtureManifest,
    };

    const created = publishRecoveryTerminalImmutableManifest(params);
    const replayed = publishRecoveryTerminalImmutableManifest(params);

    expect(created.outcome).toBe("created");
    expect(replayed.outcome).toBe("replayed");
    expect(replayed.bytes).toEqual(bytes);
    expect(readFileSync(outputPath)).toEqual(bytes);
  });

  it("rejects divergent replay from concurrent processes", async () => {
    const outputPath = fixtureOutputPath();
    const first = fixturePublication(outputPath, "first");
    const second = fixturePublication(outputPath, "second");
    const firstReady = join(directory!, "first.ready");
    const secondReady = join(directory!, "second.ready");
    const attempts = await Promise.all([
      concurrentPublisher(outputPath, "first", firstReady, secondReady),
      concurrentPublisher(outputPath, "second", secondReady, firstReady),
    ]);

    expect(attempts.map((attempt) => attempt.exitCode).sort()).toEqual([0, 2]);
    expect([
      first.bytes,
      second.bytes,
    ].some((candidate) => candidate.equals(readFileSync(outputPath)))).toBe(
      true,
    );
  });

  it("rejects output symlinks without modifying their targets", () => {
    const outputPath = fixtureOutputPath();
    const targetPath = join(directory!, "target.json");
    writeFileSync(targetPath, "preserve\n", { mode: 0o400 });
    symlinkSync(targetPath, outputPath);

    expect(() =>
      publishRecoveryTerminalImmutableManifest(
        fixturePublication(outputPath, "forged"),
      ),
    ).toThrow(/symbolic link|opened safely/u);
    expect(readFileSync(targetPath, "utf8")).toBe("preserve\n");
  });

  it("rejects an ancestor symlink swap after opening the trusted parent", () => {
    directory = mkdtempSync(join(tmpdir(), "terminal-fs-swap-"));
    const outputParent = join(directory, "output");
    const movedParent = join(directory, "opened-output");
    const outsideParent = join(directory, "outside");
    mkdirSync(outputParent);
    mkdirSync(outsideParent);
    const outputPath = join(outputParent, "manifest.json");
    let swapped = false;

    expect(() =>
      publishRecoveryTerminalImmutableManifest({
        ...fixturePublication(outputPath, "exact"),
        checkpoint: (checkpoint) => {
          if (checkpoint === "trusted_parent_opened" && !swapped) {
            swapped = true;
            renameSync(outputParent, movedParent);
            symlinkSync(outsideParent, outputParent, "dir");
          }
        },
      }),
    ).toThrow(/symbolic link|parent changed/u);
    expect(existsSync(join(outsideParent, "manifest.json"))).toBe(false);
    expect(existsSync(join(movedParent, "manifest.json"))).toBe(false);
  });

  it("holds and rechecks the exact dump path against mutation", () => {
    directory = mkdtempSync(join(tmpdir(), "terminal-fs-source-"));
    const dumpPath = join(directory, "restored.dump");
    writeFileSync(dumpPath, "exact dump\n", { mode: 0o600 });
    chmodSync(dumpPath, 0o600);
    const expectedSha256 = createHash("sha256")
      .update(readFileSync(dumpPath))
      .digest("hex");
    const source = openRecoveryTerminalImmutableSource({
      path: dumpPath,
      expectedSha256,
    });
    try {
      source.assertUnchanged();
      writeFileSync(dumpPath, "changed dump\n");
      expect(() => source.assertUnchanged()).toThrow("source dump changed");
    } finally {
      source.close();
    }
  });

  it("rejects a dump symlink before hashing", () => {
    directory = mkdtempSync(join(tmpdir(), "terminal-fs-source-link-"));
    const targetPath = join(directory, "target.dump");
    const linkPath = join(directory, "source.dump");
    writeFileSync(targetPath, "exact dump\n", { mode: 0o400 });
    symlinkSync(targetPath, linkPath);
    const expectedSha256 = createHash("sha256")
      .update(readFileSync(targetPath))
      .digest("hex");

    expect(() =>
      openRecoveryTerminalImmutableSource({
        path: linkPath,
        expectedSha256,
      }),
    ).toThrow(/symbolic link|regular file/u);
  });

  function fixtureOutputPath(): string {
    directory = mkdtempSync(join(tmpdir(), "terminal-fs-publish-"));
    return join(directory, "manifest.json");
  }
});

function fixturePublication(outputPath: string, value: string) {
  return {
    outputPath,
    bytes: Buffer.from(`${JSON.stringify({ value })}\n`),
    manifest: Object.freeze({ value }),
    parseAndValidate: parseFixtureManifest,
  };
}

function parseFixtureManifest(bytes: Buffer): Readonly<{ value: string }> {
  const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 1 ||
    !("value" in parsed) ||
    typeof parsed.value !== "string"
  ) {
    throw new Error("Fixture manifest is malformed");
  }
  return Object.freeze({ value: parsed.value });
}

function concurrentPublisher(
  outputPath: string,
  value: string,
  readyPath: string,
  peerReadyPath: string,
): Promise<Readonly<{ exitCode: number | null; stderr: string }>> {
  const modulePath = join(
    process.cwd(),
    "scripts/lib/reader-summary-recovery-terminal-manifest-filesystem.ts",
  );
  const script = `
    require("ts-node/register/transpile-only");
    const fs = require("node:fs");
    const api = require(process.argv[1]);
    const outputPath = process.argv[2];
    const value = process.argv[3];
    const readyPath = process.argv[4];
    const peerReadyPath = process.argv[5];
    const bytes = Buffer.from(JSON.stringify({ value }) + "\\n");
    const parseAndValidate = (input) => JSON.parse(input.toString("utf8"));
    try {
      api.publishRecoveryTerminalImmutableManifest({
        outputPath,
        bytes,
        manifest: { value },
        parseAndValidate,
        checkpoint: (checkpoint) => {
          if (checkpoint !== "before_publish") return;
          fs.writeFileSync(readyPath, "ready\\n");
          const deadline = Date.now() + 5000;
          while (!fs.existsSync(peerReadyPath) && Date.now() < deadline) {}
          if (!fs.existsSync(peerReadyPath)) throw new Error("barrier timeout");
        },
      });
      process.exitCode = 0;
    } catch (error) {
      process.stderr.write(error instanceof Error ? error.message : "failed");
      process.exitCode = 2;
    }
  `;
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        script,
        modulePath,
        outputPath,
        value,
        readyPath,
        peerReadyPath,
      ],
      {
        env: {
          ...process.env,
          TS_NODE_PROJECT: join(process.cwd(), "tsconfig.build.json"),
          TS_NODE_TRANSPILE_ONLY: "true",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", rejectResult);
    child.once("close", (exitCode) => {
      resolveResult({ exitCode, stderr });
    });
  });
}
