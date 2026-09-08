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
