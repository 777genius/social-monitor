import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const workflow = readFileSync(".github/workflows/pull-request.yml", "utf8");
const checker = readFileSync("scripts/check-review-ci.mjs", "utf8");
// Exercise the same pure helper used by check:review-ci without production checks.
const helper = checker.slice(
  checker.indexOf("const findJob ="),
  checker.indexOf("violations.push(...backendUnitShardingViolations(workflow));"),
);
const check = (source: string): string[] => runInNewContext(
  `${helper}\nbackendUnitShardingViolations(source)`, { source },
);

describe("backend unit whole-corpus CI sharding", () => {
  it("accepts the complete contract", () => expect(check(workflow)).toEqual([]));
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
