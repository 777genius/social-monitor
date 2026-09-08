import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const workflow = readFileSync(new URL(".github/workflows/production-deploy.yml", root), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const base = "844192f9cc745da8e9bf2428cd1c936852d220b0";
const zero = "0".repeat(40);
const fixtureRoot = "1".repeat(40);
// Extract only this step; never execute the workflow or any deployment command.
const start = workflow.indexOf("      - name: Test affected backend modules\n");
const end = workflow.indexOf("      - name:", start + 1);
const block = workflow.slice(start, end);
const expectedBody = [
  "base=$BACKEND_BASE",
  `if [[ $base == ${zero} ]]; then`,
  '  base=$(git rev-list --max-parents=0 "$GITHUB_SHA" | tail -n 1)',
  "fi",
  'npm test -- --changedSince="$base" --shard=1/2',
  'npm test -- --changedSince="$base" --shard=2/2',
].join("\n") + "\n";
const body = block.split("        run: |\n")[1]?.replace(/^          /gm, "");

test("affected gate keeps its selection, two serial shards and npm budget", () => {
  assert.ok(start >= 0 && end > start);
  assert.equal(block, [
    "      - name: Test affected backend modules",
    "        if: needs.plan.outputs.backend == 'true'",
    "        env:",
    "          BACKEND_BASE: ${{ needs.plan.outputs.backend_base }}",
    "        run: |",
    ...expectedBody.trimEnd().split("\n").map((line) => `          ${line}`),
    "",
  ].join("\n"));
  assert.equal(packageJson.scripts.test,
    "node scripts/run-with-timeout.mjs --timeout-ms 600000 --node-options --max-old-space-size=2048 -- jest --config jest.config.ts --runInBand");
});

test("release dependencies keep backend success required", () => {
  const job = (name) => workflow.match(new RegExp(`^  ${name}:\\n[\\s\\S]*?(?=^  \\w+:|$(?![\\s\\S]))`, "m"))?.[0];
  assert.doesNotMatch(workflow, /continue-on-error:|^\s*defaults:/m);
  for (const name of ["verify_backend", "release_a", "deploy"]) {
    assert.match(job(name), /^    timeout-minutes: 120$/m);
    assert.doesNotMatch(job(name), /^    if:|^    continue-on-error:|^    defaults:/m);
  }
  assert.match(job("verify_backend"), /^    needs: plan$/m);
  for (const [name, needs] of [
    ["release_a", ["plan", "verify_reader_summary_publication", "verify_backend", "build_frontend"]],
    ["deploy", ["plan", "verify_reader_summary_publication", "verify_backend", "build_frontend", "release_a"]],
    ["acceptance", ["plan", "deploy"]],
  ]) {
    assert.equal(job(name).match(/^    needs:\n((?:      - .*\n)+)/m)?.[1],
      needs.map((dependency) => `      - ${dependency}\n`).join(""));
  }
});

// Bash functions replace all commands in the allowlisted body. Empty PATH and
// environment prevent npm, Git, credentials or production tools being used.
for (const inputBase of [base, zero]) {
  for (const [first, second] of [[0, 0], [1, 0], [124, 0], [0, 1], [0, 124]]) {
    test(`base=${inputBase === zero ? "zero" : "normal"}, shard statuses=${first}/${second}`, () => {
      assert.equal(body, expectedBody, "refuse to execute an unexpected shell body");
      const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-e", "-c", `
git() {
  [[ "$*" == "rev-list --max-parents=0 fixture-release" ]] || return 91
  printf '%s\\n' '${fixtureRoot}'
}
tail() {
  [[ "$*" == "-n 1" ]] || return 92
  local line
  while IFS= read -r line; do last=$line; done
  printf '%s\\n' "$last"
}
npm() {
  printf 'npm'
  printf ' <%s>' "$@"
  printf '\\n'
  case "$4" in
    --shard=1/2) return ${first} ;;
    --shard=2/2) return ${second} ;;
    *) return 93 ;;
  esac
}
${body}printf 'gate-success\\n'
`], {
        cwd: root, encoding: "utf8", timeout: 2000,
        env: { PATH: "", BACKEND_BASE: inputBase, GITHUB_SHA: "fixture-release" },
      });
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, first || second);
      assert.equal(result.stderr, "");
      const normalized = inputBase === zero ? fixtureRoot : base;
      const command = (shard) => `npm <test> <--> <--changedSince=${normalized}> <--shard=${shard}/2>\n`;
      assert.equal(result.stdout, command(1) + (first ? "" : command(2)) +
        (first || second ? "" : "gate-success\n"));
    });
  }
}
