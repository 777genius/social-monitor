import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertMetricMaintenanceLocks, metricMaintenanceAdmission, metricMaintenanceLocks } from "./retained-metric-maintenance";

describe("existing production maintenance contract, honestly bounded legacy exclusion", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "metric-maintenance-")); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  it("requires an explicit parent retirement reference before touching source, locks or database", () => {
    expect(() => metricMaintenanceAdmission("a".repeat(64), "b".repeat(64), undefined)).toThrow("legacy-retirement");
    expect(() => assertMetricMaintenanceLocks([[7, join(root, "absent.lock")]])).toThrow();
  });
  it("verifies inherited INNER wrapper flocks, and rejects open-but-unheld, symlink and replacement inodes", () => {
    const paths = [7, 9, 8].map((fd) => [fd, join(root, `${fd}.lock`)] as const);
    for (const [, path] of paths) writeFileSync(path, "", { mode: 0o400 });
    const driver = join(root, "driver.cjs");
    writeFileSync(driver, `
      require(process.cwd() + '/node_modules/ts-node').register({transpileOnly:true,project:process.cwd()+'/tsconfig.build.json'}); require(process.cwd() + '/node_modules/tsconfig-paths/register');
      const fs = require('node:fs'); const {assertMetricMaintenanceLocks} = require(process.cwd() + '/scripts/lib/retained-metric-maintenance');
      const paths = JSON.parse(process.env.METRIC_TEST_LOCK_PATHS);
      assertMetricMaintenanceLocks(paths);
      const contender = require('node:child_process').spawnSync('bash', ['-c', 'exec 3<"$1"; flock -xn 3', 'contender', paths[0][1]]);
      if(contender.status !== 1) throw Error('existing maintenance lock did not exclude contender');
      fs.renameSync(paths[0][1], paths[0][1]+'.old'); fs.writeFileSync(paths[0][1], '', {mode:0o400});
      let refused = false; try {assertMetricMaintenanceLocks(paths)} catch {refused=true} if(!refused) throw Error('replacement admitted');
      fs.unlinkSync(paths[0][1]); fs.symlinkSync(paths[0][1]+'.old', paths[0][1]);
      refused = false; try {assertMetricMaintenanceLocks(paths)} catch {refused=true} if(!refused) throw Error('alias admitted');
    `);
    const env = { ...process.env, NODE_ENV: "test", METRIC_TEST_LOCK_PATHS: JSON.stringify(paths) };
    const unlocked = spawnSync("bash", ["-c", 'exec 7<"$1" 9<"$2" 8<"$3"; exec "$4" "$5"',
      "unheld-wrapper", ...paths.map(([, path]) => path), process.execPath, driver], { env, stdio: "pipe", timeout: 15_000 });
    expect(unlocked.status).not.toBe(0);
    execFileSync("bash", ["-c", 'exec 7<"$1" 9<"$2" 8<"$3"; flock -x 7; flock -x 9; flock -x 8; exec "$4" "$5"', "inner-wrapper", ...paths.map(([, path]) => path), process.execPath, driver], { env, stdio: "pipe", timeout: 15_000 });
  });
  it("demonstrates that an unmodified writer can ignore operation.lock; only the existing maintenance contract excludes it", () => {
    const directory = join(root, "seven-day-6101-6102/retained-metrics-v1");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, "operation.lock"); writeFileSync(path, "", { mode: 0o400 });
    const driver = join(root, "legacy.cjs");
    writeFileSync(driver, `
      require(process.cwd() + '/node_modules/ts-node').register({transpileOnly:true,project:process.cwd()+'/tsconfig.build.json'}); require(process.cwd() + '/node_modules/tsconfig-paths/register');
      const {readFileSync} = require('node:fs'), {createHash} = require('node:crypto'), Module = require('node:module');
      const ts = require(process.cwd() + '/node_modules/typescript');
      // Exact source bytes from 0de33d8751bfd1e8ae722698e60ef893d324d9e5, available in shallow CI checkouts.
      function original(path, expectedSha256) {
        const source = readFileSync(process.cwd() + '/test-fixtures/retained-metric-legacy/' + path.split('/').at(-1) + '.txt');
        if (createHash('sha256').update(source).digest('hex') !== expectedSha256) throw Error('Legacy source SHA256 mismatch: ' + path);
        const filename = process.cwd() + '/' + path;
        const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(require('node:path').dirname(filename));
        mod._compile(ts.transpileModule(source.toString('utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText, filename);
        return mod.exports;
      }
      const {SecureMetricRefreshReceipts, metricRefreshDigest} = original('scripts/lib/retained-metric-refresh-receipts.ts',
        '2ea4f4e236e8244aaebf6cfda77b7e024a1fbc5ab915fe2a091b1294f5d3fea2');
      const {RefreshRetainedMetricsUseCase} = original('libs/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.use-case.ts',
        '856f4d16b9d977638156728a734e2ae6c370e7766cf26627ad74c78acb7efb9d');
      const {createRecoveryEvidenceFilesystemTestHarness} = require(process.cwd() + '/scripts/lib/reader-summary-recovery-evidence-secure-file');
      const {manifest} = require(process.cwd() + '/scripts/lib/retained-metric-refresh.spec-support');
      const m = manifest(), row = m.targets[0]; let fetches = 0;
      const receipts = new SecureMetricRefreshReceipts(createRecoveryEvidenceFilesystemTestHarness(process.argv[2]));
      const usecase = new RefreshRetainedMetricsUseCase({list:async()=>m.targets,read:async()=>row},
        {fetch:async()=>{fetches++;return {ok:true,value:[]}}}, {project:async()=>{throw Error('unexpected projection')}},
        receipts, {now:()=>new Date(m.plannedAt)}, metricRefreshDigest);
      usecase.execute(m).then(result=>{if(!result.ok || fetches!==1) throw Error('legacy execution did not cross marker');})
        .catch(error=>{console.error(error);process.exitCode=1});
    `);
    execFileSync("bash", ["-c", 'exec 3<"$1"; flock -x 3; exec "$2" "$3" "$4"', "legacy-test", path, process.execPath, driver, root],
      { env: { ...process.env, NODE_ENV: "test" }, timeout: 20_000 });
    expect(JSON.parse(readFileSync(join(directory, "batch-0.reserved.json"), "utf8"))).toHaveProperty("value.manifestDigest");
    expect(metricMaintenanceLocks.map(([fd, lock]) => [fd, lock.split("/").at(-1)])).toEqual([[7, "production-deploy.lock"], [9, "daily-run-singleton.lock"], [8, "daily-run.lock"]]);
    expect(spawnSync("bash", ["-n", "scripts/run-retained-metric-maintenance.sh"]).status).toBe(0);
  });
});
