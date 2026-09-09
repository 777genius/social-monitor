import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const workflow = readFileSync(".github/workflows/pull-request.yml", "utf8");
const checker = readFileSync("scripts/check-review-ci.mjs", "utf8");
const yaml = createRequire(`${process.cwd()}/scripts/check-review-ci.mjs`)("js-yaml");
// Exercise the same pure helper used by check:review-ci without production checks.
const helper = checker.slice(
  checker.indexOf("const findJob ="),
  checker.indexOf("violations.push(...backendUnitShardingViolations(workflow));"),
);
const check = (source: string): string[] => runInNewContext(
  `${helper}\nbackendUnitShardingViolations(source)`, { source, yaml },
);

describe("backend unit whole-corpus CI sharding", () => {
  it("accepts the complete contract", () => expect(check(workflow)).toEqual([]));
  it("rejects malformed YAML before checking the narrow job contract", () => {
    expect(workflow).toContain("jobs:\n");
    expect(check(workflow.replace("jobs:\n", "jobs: [\n"))).toEqual([
      expect.stringContaining("invalid YAML:"),
    ]);
  });
  it.each(["backend_unit", "backend_unit_shards"])(
    "rejects a duplicate %s job before checking the narrow job contract",
    (jobId) => {
      const duplicate = `\n  ${jobId}:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n`;
      expect(check(workflow + duplicate)).toEqual([
        expect.stringContaining("invalid YAML: duplicated mapping key"),
      ]);
    },
  );
  it.each([
    ["node scripts/run-with-timeout.mjs --timeout-ms 900000 --node-options --max-old-space-size=2048 -- ", ""],
    ["--timeout-ms 900000", "--timeout-ms 600000"],
    ["--timeout-ms 900000", "--timeout-ms 900001"],
    ["--timeout-ms 900000", "--timeout-ms 0"],
    ["node scripts/run-with-timeout.mjs --timeout-ms 900000 --node-options --max-old-space-size=2048 -- ./node_modules/.bin/jest --config jest.config.ts --runInBand --shard=${{ matrix.shard }}/4", "npm test -- --shard=${{ matrix.shard }}/4"],
    ["node scripts/run-with-timeout.mjs --timeout-ms 900000 --node-options --max-old-space-size=2048 -- ./node_modules/.bin/jest --config jest.config.ts --runInBand --shard=${{ matrix.shard }}/4", "true"],
    ["--shard=${{ matrix.shard }}/4", "--shard=${{ matrix.shard }}/4 --testPathIgnorePatterns=retained-metric"],
    ["--shard=${{ matrix.shard }}/4", "--shard=${{ matrix.shard }}/4 --testNamePattern=small"],
    ["      - name: Run backend unit tests", "      - name: Run backend unit tests\n        if: false"],
    ["--max-old-space-size=2048", "--max-old-space-size=1536"],
    ["--runInBand ", ""],
    ["[1, 2, 3, 4]", "[1, 2, 3]"],
    ["[1, 2, 3, 4]", "[1, 2, 3, 3]"],
    ["fail-fast: false", "fail-fast: true"],
    ["--shard=${{ matrix.shard }}/4", "--shard=${{ matrix.shard }}/5"],
    ["--shard=${{ matrix.shard }}/4", "--shard=${{ matrix.shard }}/4 --passWithNoTests"],
    ["--shard=${{ matrix.shard }}/4", "--shard=${{ matrix.shard }}/4 --testPathPatterns=small"],
    ["needs: backend_unit_shards", "needs: static_quality"],
    ["if: always()", "if: success()"],
    ['= "success"', '!= "failure"'],
    ['= "success"', '= "success" || true'],
    ["    strategy:", "    continue-on-error: true\n    strategy:"],
    ["    strategy:", "    if: false\n    strategy:"],
    ["        shard: [1, 2, 3, 4]", "        shard: [1, 2, 3, 4]\n        exclude: [{shard: 4}]"],
    ["Backend build and unit tests", "Renamed backend check"],
    ["run: npm run build", "run: true"],
    ["run: npm run check:subscription-runtime-usage-contract", "run: true"],
    ["run: npm run check:subscription-runtime-auth-pool-e2e", "run: true"],
    ["bash ops/deploy/production-runtime/reader-promotion-v2-production-canary.test.sh", "true"],
  ])("rejects contract mutation %s -> %s", (before, after) => {
    expect(workflow).toContain(before);
    expect(check(workflow.replace(before, after))).not.toEqual([]);
  });
});

const reviewedSandboxTests = [
  "apps/agent-runtime/bin/codex-auth-pool-manifest.test.mjs",
  "apps/agent-runtime/bin/codex-auth-pool-routing.test.mjs",
  "apps/agent-runtime/bin/subscription-runtime-auth-pool.e2e.test.mjs",
  "apps/agent-runtime/bin/subscription-runtime-purpose-model-policy.test.mjs",
  "apps/agent-runtime/bin/subscription-runtime-failure-details.test.mjs",
  "apps/agent-runtime/bin/pinned-codex-native-binary.test.mjs",
  "apps/agent-runtime/src/source-content-assessment-pool.test.mjs",
];
const sandboxPrefix = "node --test --test-concurrency=1";
const sandboxCommand = `${sandboxPrefix} ${reviewedSandboxTests.join(" ")}`;
const sandboxContract = checker.slice(
  checker.indexOf("const subscriptionRuntimeAuthPoolE2eCommand ="),
  checker.indexOf("const dailyCursorPostgres18Command ="),
);
const sandboxAdmission = checker.slice(
  checker.indexOf('if (\n  packageJson.scripts?.["check:subscription-runtime-auth-pool-e2e"]'),
  checker.indexOf("for (const command of [rollingReceiptTest, rollingRunTest])"),
);
const checkSandboxCommand = (command: unknown): string[] => runInNewContext(
  `${sandboxContract}\n${sandboxAdmission}\nviolations`,
  { packageJson: { scripts: { "check:subscription-runtime-auth-pool-e2e": command } }, violations: [] },
);

describe("subscription runtime deterministic sandbox CI allowlist", () => {
  it("accepts exactly the seven reviewed sandbox tests", () => {
    expect(checkSandboxCommand(sandboxCommand)).toEqual([]);
  });
  it.each(reviewedSandboxTests)("rejects omission of %s", (omitted) => {
    expect(checkSandboxCommand(`${sandboxPrefix} ${reviewedSandboxTests.filter((path) => path !== omitted).join(" ")}`))
      .toEqual([expect.stringContaining("only the reviewed deterministic sandbox tests")]);
  });
  it.each([
    undefined,
    "",
    `${sandboxPrefix} apps/agent-runtime/bin/*.test.mjs`,
    `${sandboxCommand} apps/agent-runtime/bin/unreviewed.test.mjs`,
    `${sandboxCommand} ${reviewedSandboxTests[0]}`,
    `${sandboxCommand} && node unreviewed.mjs`,
    sandboxCommand.replace("--test-concurrency=1", "--test-concurrency=2"),
    sandboxCommand.replace("--test-concurrency=1 ", ""),
    `${sandboxPrefix} ${[...reviewedSandboxTests].reverse().join(" ")}`,
    sandboxCommand.replace("pinned-codex-native-binary.test.mjs", "*.test.mjs"),
    sandboxCommand.replace("source-content-assessment-pool.test.mjs", "*.test.mjs"),
  ])("rejects changed sandbox command %s", (command) => {
    expect(checkSandboxCommand(command))
      .toEqual([expect.stringContaining("only the reviewed deterministic sandbox tests")]);
  });
});
