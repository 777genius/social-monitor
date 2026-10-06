import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
const { load, dump } = createRequire(resolve("package.json"))("js-yaml") as {
  load(source: string): unknown; dump(value: unknown): string;
};
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";

const workflow = readFileSync(".github/workflows/pull-request.yml", "utf8");
const checker = readFileSync("scripts/check-review-ci.mjs", "utf8");
// Exercise the imported semantic contract directly, without production checks.
const check = (source: string): string[] => JSON.parse(execFileSync(process.execPath, [
  "--input-type=module", "-e",
  "import {readFileSync} from 'node:fs'; import {backendUnitShardingViolations as check} from './scripts/ci/review-ci/backend-unit-contract.mjs'; console.log(JSON.stringify(check(readFileSync(0, 'utf8'))));",
], { input: source, encoding: "utf8" }));

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
    ["node scripts/run-with-timeout.mjs --timeout-ms 2700000 --node-options --max-old-space-size=4096 -- ", ""],
    ["--timeout-ms 2700000", "--timeout-ms 600000"],
    ["--timeout-ms 2700000", "--timeout-ms 2700001"],
    ["--timeout-ms 2700000", "--timeout-ms 0"],
    ["node scripts/run-with-timeout.mjs --timeout-ms 2700000 --node-options --max-old-space-size=4096 -- ./node_modules/.bin/jest --config jest.config.ts --runInBand --shard=${{ matrix.shard }}/6", "npm test -- --shard=${{ matrix.shard }}/6"],
    ["node scripts/run-with-timeout.mjs --timeout-ms 2700000 --node-options --max-old-space-size=4096 -- ./node_modules/.bin/jest --config jest.config.ts --runInBand --shard=${{ matrix.shard }}/6", "true"],
    ["--shard=${{ matrix.shard }}/6", "--shard=${{ matrix.shard }}/6 --testPathIgnorePatterns=retained-metric"],
    ["--shard=${{ matrix.shard }}/6", "--shard=${{ matrix.shard }}/6 --testNamePattern=small"],
    ["      - name: Run backend unit tests", "      - name: Run backend unit tests\n        if: false"],
    ["--max-old-space-size=4096 -- ./node_modules/.bin/jest --config jest.config.ts --runInBand --shard=${{ matrix.shard }}/6", "--max-old-space-size=1536 -- ./node_modules/.bin/jest --config jest.config.ts --runInBand --shard=${{ matrix.shard }}/6"],
    ["--runInBand ", ""],
    ["[1, 2, 3, 4, 5, 6]", "[1, 2, 3, 4, 5]"],
    ["[1, 2, 3, 4, 5, 6]", "[1, 2, 3, 4, 5, 5]"],
    ["fail-fast: false", "fail-fast: true"],
    ["--shard=${{ matrix.shard }}/6", "--shard=${{ matrix.shard }}/5"],
    ["--shard=${{ matrix.shard }}/6", "--shard=${{ matrix.shard }}/6 --passWithNoTests"],
    ["--shard=${{ matrix.shard }}/6", "--shard=${{ matrix.shard }}/6 --testPathPatterns=small"],
    ["needs: [backend_unit_shards, backend_build_contracts]", "needs: static_quality"],
    ["if: always()", "if: success()"],
    ['= "success"', '!= "failure"'],
    ['= "success"', '= "success" || true'],
    ["    strategy:", "    continue-on-error: true\n    strategy:"],
    ["    strategy:", "    if: false\n    strategy:"],
    ["        shard: [1, 2, 3, 4, 5, 6]", "        shard: [1, 2, 3, 4, 5, 6]\n        exclude: [{shard: 6}]"],
    ["Backend build and unit tests", "Renamed backend check"],
    ["          fetch-depth: 0", "          fetch-depth: 1"],
    ["run: npm run check:reader-paired-experiment", "run: true"],
    ["run: npm run check:reader-paired-experiment", "run: npm run check:reader-paired-experiment || true"],
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

const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
const commandHelper = checker.slice(
  checker.indexOf("const pairedSelectorCommandViolations ="),
  checker.indexOf("violations.push(...pairedSelectorCommandViolations(packageJson.scripts));"),
);
const checkCommand = (scripts: Record<string, string>): string[] => runInNewContext(
  `${commandHelper}\npairedSelectorCommandViolations(scripts)`, { scripts },
);

describe("offline paired selector npm gate", () => {
  it("accepts the bounded full inventory", () => expect(checkCommand(packageScripts)).toEqual([]));
  it.each([
    ["--test-concurrency=1", "--test-concurrency=2"],
    ["--max-old-space-size=1536", "--max-old-space-size=4096"],
    ["--timeout-ms 180000", "--timeout-ms 900000"],
    ["*.test.cjs", "full-selector.test.cjs"],
  ])("rejects command mutation %s", (before, after) => {
    const command = packageScripts["check:reader-paired-experiment"] as string;
    expect(command).toContain(before);
    expect(checkCommand({ "check:reader-paired-experiment": command.replace(before, after) })).not.toEqual([]);
  });
  it("rejects a missing gate", () => expect(checkCommand({})).not.toEqual([]));
});

// The guard parses YAML; execute the resolver and independently hash real lockfile
// contents to prove cache invalidation rather than only matching key source text.
const flutterHelper = checker.slice(
  checker.indexOf('const flutterCacheViolations ='),
  checker.indexOf('violations.push(...flutterCacheViolations(workflow));'),
);
const checkFlutterCache = (source: string): string[] => runInNewContext(
  `${flutterHelper}\nflutterCacheViolations(source)`, { source, loadYaml: load },
);
const frontendSteps = (load(workflow) as { jobs: { frontend: { steps: Array<{
  id?: string; run?: string; uses?: string; with?: Record<string, unknown>;
}> } } }).jobs.frontend.steps;

describe('exact Flutter cache contract', () => {
  it('accepts parsed workflow including equivalent YAML serialization', () => {
    expect(checkFlutterCache(workflow)).toEqual([]);
    expect(checkFlutterCache(dump(load(workflow)))).toEqual([]);
  });
  it.each([
    ['cache: true', 'cache: false'], ['pub-cache: true', 'pub-cache: false'],
    ['channel: stable', 'channel: beta'],
    ['flutter-version-file: apps/frontend/.fvmrc', 'flutter-version-file: apps/frontend/app/.fvmrc'],
    ['${{ runner.arch }}', 'x64'], ['${{ runner.os }}', 'Linux'],
    ['${{ steps.flutter_version.outputs.version }}', '3.41.x'],
    ["hashFiles('apps/frontend/**/pubspec.lock')", "hashFiles('apps/frontend/app/pubspec.lock')"],
    ['id: flutter_version', 'id: wrong_version'],
    [".flutter;", ".flutter.split('.').slice(0, 2).join('.');"],
    ['          channel: stable', '          flutter-version: 3.41.x\n          channel: stable'],
    ['      - name: Set up Flutter', '      - name: Set up Flutter\n        if: false'],
    ['        id: flutter_version', '        id: flutter_version\n        continue-on-error: true'],
  ])('rejects cache drift %s', (before, after) => {
    expect(workflow).toContain(before);
    expect(checkFlutterCache(workflow.replace(before, after))).not.toEqual([]);
  });
  it('executes exact version resolver; locks invalidate only pub cache, SDK/runner changes invalidate both', () => {
    mkdirSync(resolve('node_modules/.cicd-evidence'), { recursive: true });
    const directory = mkdtempSync(resolve('node_modules/.cicd-evidence/flutter-cache-'));
    const lockPaths = readdirSync('apps/frontend', { recursive: true, encoding: 'utf8' })
      .filter((path) => path === 'pubspec.lock' || path.endsWith('/pubspec.lock'))
      .map((path) => 'apps/frontend/' + path).sort();
    expect(lockPaths.length).toBeGreaterThanOrEqual(1);
    const fixtureLocks = [...new Set([...lockPaths, 'apps/frontend/app/pubspec.lock',
      'apps/frontend/features/feed/pubspec.lock', 'apps/frontend/packages/shared_kernel/pubspec.lock'])].sort();
    const versionStep = frontendSteps.find((step) => step.id === 'flutter_version');
    const setup = frontendSteps.find((step) => step.uses?.startsWith('subosito/flutter-action@'));
    const versionFile = resolve(directory, 'apps/frontend/.fvmrc');
    const output = resolve(directory, 'output');
    const exact = JSON.parse(readFileSync('apps/frontend/.fvmrc', 'utf8')).flutter as string;
    const resolvedVersion = (version: string): string => {
      writeFileSync(versionFile, JSON.stringify({ flutter: version }));
      writeFileSync(output, '');
      execFileSync('bash', ['-euc', versionStep?.run ?? 'false'], {
        cwd: directory, env: { ...process.env, GITHUB_OUTPUT: output,
          PATH: `${resolve(directory, 'bin')}:${process.env.PATH ?? ''}` }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const resolved = readFileSync(output, 'utf8').trim().match(/^version=(\d+\.\d+\.\d+)$/u)?.[1];
      if (resolved === undefined) throw new Error('missing resolved Flutter version');
      return resolved;
    };
    const keys = (version: string, os = 'Linux', arch = 'X64'): string[] => {
      // GitHub hashFiles combines SHA256 digests of every matched file.
      const hash = createHash('sha256');
      for (const path of fixtureLocks) hash.update(createHash('sha256').update(readFileSync(resolve(directory, path))).digest());
      const lockHash = hash.digest('hex');
      return ['cache-key', 'pub-cache-key'].map((key) => String(setup?.with?.[key]).replace(/\$\{\{\s*(.*?)\s*\}\}/gu, (_, expression: string) => {
        const values: Record<string, string> = { 'runner.os': os, 'runner.arch': arch,
          'steps.flutter_version.outputs.version': version, "hashFiles('apps/frontend/**/pubspec.lock')": lockHash };
        if (values[expression] === undefined) throw new Error(`unsupported cache expression ${expression}`);
        return values[expression];
      }));
    };
    try {
      mkdirSync(resolve(directory, 'apps/frontend'), { recursive: true });
      mkdirSync(resolve(directory, 'bin'));
      writeFileSync(resolve(directory, 'bin/node'), `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
      for (const path of fixtureLocks) {
        mkdirSync(dirname(resolve(directory, path)), { recursive: true });
        writeFileSync(resolve(directory, path), lockPaths.includes(path) ? readFileSync(path) : '# synthetic workspace lock\n');
      }
      expect(resolvedVersion(exact)).toBe(exact);
      const original = keys(exact);
      const next = exact.replace(/\d+$/u, (patch) => String(Number(patch) + 1));
      expect(resolvedVersion(next)).toBe(next);
      for (const variant of [keys(next), keys(exact, 'macOS'), keys(exact, 'Linux', 'ARM64')]) {
        expect(variant[0]).not.toBe(original[0]); expect(variant[1]).not.toBe(original[1]);
      }
      for (const path of fixtureLocks) {
        const file = resolve(directory, path);
        const before = readFileSync(file);
        writeFileSync(file, Buffer.concat([before, Buffer.from('\n# synthetic lock change\n')]));
        const changed = keys(exact);
        expect(changed[0]).toBe(original[0]); expect(changed[1]).not.toBe(original[1]);
        writeFileSync(file, before);
      }
      writeFileSync(resolve(directory, 'apps/frontend/code.dart'), '// synthetic UI-only change');
      expect(keys(exact)).toEqual(original);
      for (const invalid of ['stable', '3.41.x', '3.41', '3.41.9-beta']) expect(() => resolvedVersion(invalid)).toThrow();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
