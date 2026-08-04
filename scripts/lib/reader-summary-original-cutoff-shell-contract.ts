import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const assertShellStops = ({
  correctionMigration,
  activationAclMigration,
  weeklyManifestMigration,
  dailyV4ForwardMigration,
  dailyV4ForwardOldChecksum,
  dailyV4ForwardPreviousChecksum,
  dailyV4ForwardNewChecksum,
}: Readonly<{
  correctionMigration: string;
  activationAclMigration: string;
  weeklyManifestMigration: string;
  dailyV4ForwardMigration: string;
  dailyV4ForwardOldChecksum: string;
  dailyV4ForwardPreviousChecksum: string;
  dailyV4ForwardNewChecksum: string;
}>): void => {
  const deployLibrary = readFileSync(
    "ops/deploy/reader-summary-publication-deploy-lib.sh",
    "utf8",
  );
  const start = deployLibrary.indexOf(
    "deploy_reader_summary_publication_migrations() {",
  );
  const end = deployLibrary.indexOf(
    "\n}\n\nrun_reader_summary_publication_admin_sql()",
    start,
  );
  assert(start >= 0 && end > start, "publication deploy function is absent");
  const deployFunction = deployLibrary.slice(start, end + 2);
  const helper = readFileSync(
    "ops/deploy/reader-summary-original-cutoff-correction-lib.sh",
    "utf8",
  );
  const preflight = readFileSync(
    "ops/deploy/reader-summary-original-cutoff-failed-migration-preflight.sql",
    "utf8",
  );
  const entrypoint = readFileSync(
    "ops/deploy/social-monitor-production-deploy.sh",
    "utf8",
  );
  assert(
    entrypoint.startsWith("#!/usr/bin/env bash\nset -euo pipefail\n") &&
      /^\s{4}deploy_reader_summary_publication_migrations$/mu.test(entrypoint),
    "production entrypoint no longer makes publication migration fatal",
  );
  assert(
    helper.includes(`READER_SUMMARY_DAILY_V4_FORWARD_MIGRATION=${dailyV4ForwardMigration}`) &&
      helper.includes(`READER_SUMMARY_DAILY_V4_FORWARD_NEW_CHECKSUM=${dailyV4ForwardNewChecksum}`) &&
      helper.includes('[[ $target_digest == "$READER_SUMMARY_DAILY_V4_FORWARD_NEW_CHECKSUM" ]]') &&
      helper.includes("daily-v4-forward-current-rollback") &&
      helper.includes("forward-resolved") &&
      preflight.includes(dailyV4ForwardMigration) &&
      preflight.includes(dailyV4ForwardOldChecksum) &&
      preflight.includes(dailyV4ForwardPreviousChecksum) &&
      preflight.includes(dailyV4ForwardNewChecksum) &&
      preflight.includes("v_daily_v4_forward_old_rolled_back = 1") &&
      preflight.includes("v_unfinished = 1") &&
      preflight.includes("v_daily_v4_forward_rows = 3") &&
      preflight.indexOf("daily-v4-forward-current-rollback") <
        preflight.indexOf("daily-execution-rls-rollback"),
    "daily V4 forward retry no longer pins the exact reviewed failed-row lifecycle",
  );
  const directory = mkdtempSync(join(tmpdir(), "original-cutoff-shell-"));
  const script = join(directory, "gate.sh");
  writeFileSync(
    script,
    `set -u\n${helper}\n${deployFunction}\n` + String.raw`
ROOT=/tmp/original-cutoff-shell
REPO=$PWD
COMPOSE=(compose_stub)
READER_SUMMARY_PUBLICATION_RUNTIME_ROLE=runtime
mkdir -p "$ROOT/secrets/db"
verify_reader_summary_original_cutoff_target() { :; }
reader_summary_publication_migrator_preflight() { printf 'preflight\n' >>"$EVENTS"; }
run_reader_summary_publication_admin_sql() { printf 'admin:%s\n' "$4" >>"$EVENTS"; }
compose_stub() { printf 'migrate\n' >>"$EVENTS"; return "$MIGRATE_STATUS"; }
reader_summary_original_cutoff_probe() {
  printf 'probe:%s\n' "$1" >>"$EVENTS"
  probe_count=$(grep -c '^probe:' "$EVENTS")
  case "$PROBE_MODE:$probe_count:$1" in
    success:1:pre) printf 'rollback\n' ;;
    success:2:pre) printf 'apply\n' ;;
    success:3:resolved) printf 'resolved\n' ;;
    success:4:post) printf 'corrected\n' ;;
    clean:1:pre) printf 'clean\n' ;;
    clean:2:post) printf 'corrected\n' ;;
    apply:1:pre) printf 'apply\n' ;;
    apply:2:resolved) printf 'resolved\n' ;;
    apply:3:post) printf 'corrected\n' ;;
    retry-failure:1:pre) printf 'rollback\n' ;;
    correction:1:pre) printf 'correction-rollback\n' ;;
    correction:2:pre) printf 'clean\n' ;;
    correction:3:post) printf 'corrected\n' ;;
    activation:1:pre) printf 'activation-acl-rollback\n' ;;
    activation:2:pre) printf 'clean\n' ;;
    activation:3:post) printf 'corrected\n' ;;
    weekly-manifest:1:pre) printf 'weekly-manifest-rollback\n' ;;
    weekly-manifest:2:pre) printf 'clean\n' ;;
    weekly-manifest:3:post) printf 'corrected\n' ;;
    daily-v4:1:pre) printf 'daily-canonical-v4-rollback\n' ;;
    daily-v4:2:pre) printf 'clean\n' ;;
    daily-v4:3:post) printf 'corrected\n' ;;
    daily-rls:1:pre) printf 'daily-execution-rls-rollback\n' ;;
    daily-rls:2:pre) printf 'clean\n' ;;
    daily-rls:3:post) printf 'corrected\n' ;;
    daily-v4-forward:1:pre) printf 'daily-v4-forward-current-rollback\n' ;;
    daily-v4-forward:2:forward-resolved) printf 'forward-resolved\n' ;;
    daily-v4-forward:3:post) printf 'corrected\n' ;;
    *:2:pre) return 71 ;;
    *) return 72 ;;
  esac
}
run_reader_summary_original_cutoff_prisma_resolve() {
  if [ "$#" -eq 2 ]; then
    printf 'resolve:%s:%s\n' "$1" "$2" >>"$EVENTS"
  else
    printf 'resolve:%s\n' "$1" >>"$EVENTS"
  fi
  [ "$FAIL_RESOLUTION" != "$1" ]
}
case $CASE in
  resolve) resolve_reader_summary_original_cutoff_failure ;;
  deploy) deploy_reader_summary_publication_migrations ;;
esac
`,
  );
  const runCase = (
    name: string,
    values: NodeJS.ProcessEnv,
    shouldSucceed = false,
  ): readonly string[] => {
    const events = join(directory, `${name}.events`);
    const result = spawnSync("bash", [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        EVENTS: events,
        FAIL_RESOLUTION: "",
        MIGRATE_STATUS: "0",
        PROBE_MODE: "success",
        ...values,
      },
    });
    assert(
      shouldSucceed ? result.status === 0 : result.status !== 0,
      `${name} had unexpected status ${result.status}\n` +
        `${result.stdout}${result.stderr}`,
    );
    return readFileSync(events, "utf8").trim().split("\n");
  };
  const success = runCase("success", { CASE: "deploy" }, true);
  assert(
    success.join("\n") === [
      "preflight", "admin:pre", "probe:pre", "resolve:rolled-back",
      "probe:pre", "resolve:applied", "probe:resolved", "migrate",
      "probe:post", "admin:post",
    ].join("\n"),
    "rollback, apply, migrate, and post steps ran out of order",
  );
  const retry = runCase("terminal-retry", {
    CASE: "deploy",
    PROBE_MODE: "clean",
  }, true);
  assert(
    retry.join("\n") === [
      "preflight", "admin:pre", "probe:pre", "migrate", "probe:post",
      "admin:post",
    ].join("\n"),
    "terminal retry was not a resolve-free no-op",
  );
  const correctionRetry = runCase("correction-retry", {
    CASE: "deploy",
    PROBE_MODE: "correction",
  }, true);
  assert(
    correctionRetry.join("\n") === [
      "preflight", "admin:pre", "probe:pre",
      `resolve:rolled-back:${correctionMigration}`, "probe:pre", "migrate",
      "probe:post", "admin:post",
    ].join("\n"),
    "correction retry did not resolve only the reviewed failed correction",
  );
  const activationRetry = runCase("activation-retry", {
    CASE: "deploy",
    PROBE_MODE: "activation",
  }, true);
  assert(
    activationRetry.join("\n") === [
      "preflight", "admin:pre", "probe:pre",
      `resolve:rolled-back:${activationAclMigration}`, "probe:pre", "migrate",
      "probe:post", "admin:post",
    ].join("\n"),
    "activation ACL retry did not resolve only the reviewed failed migration",
  );
  const weeklyManifestRetry = runCase("weekly-manifest-retry", {
    CASE: "deploy",
    PROBE_MODE: "weekly-manifest",
  }, true);
  assert(
    weeklyManifestRetry.join("\n") === [
      "preflight", "admin:pre", "probe:pre",
      `resolve:rolled-back:${weeklyManifestMigration}`, "probe:pre", "migrate",
      "probe:post", "admin:post",
    ].join("\n"),
    "weekly manifest retry did not resolve only the reviewed failed migration",
  );
  const dailyV4Retry = runCase("daily-v4-retry", {
    CASE: "deploy",
    PROBE_MODE: "daily-v4",
  }, true);
  assert(
    dailyV4Retry.join("\n") === [
      "preflight", "admin:pre", "probe:pre",
      "resolve:rolled-back:20260802233000_reader_summary_daily_canonical_recovery_v4",
      "probe:pre", "migrate", "probe:post", "admin:post",
    ].join("\n"),
    "daily V4 retry did not resolve only the reviewed failed migration",
  );
  const dailyRlsRetry = runCase("daily-rls-retry", {
    CASE: "deploy",
    PROBE_MODE: "daily-rls",
  }, true);
  assert(
    dailyRlsRetry.join("\n") === [
      "preflight", "admin:pre", "probe:pre",
      "resolve:rolled-back:20260803174000_reader_summary_daily_execution_tenant_rls",
      "probe:pre", "migrate", "probe:post", "admin:post",
    ].join("\n"),
    "daily execution RLS retry did not resolve only the reviewed failed migration",
  );
  const dailyV4ForwardRetry = runCase("daily-v4-forward-retry", {
    CASE: "deploy",
    PROBE_MODE: "daily-v4-forward",
  }, true);
  assert(
    dailyV4ForwardRetry.join("\n") === [
      "preflight", "admin:pre", "probe:pre",
      `resolve:rolled-back:${dailyV4ForwardMigration}`,
      "probe:forward-resolved", "migrate", "probe:post", "admin:post",
    ].join("\n"),
    "daily V4 forward retry did not resolve the exact failed migration before deploy",
  );
  const resolveFailure = runCase("resolve-failure", {
    CASE: "resolve",
    FAIL_RESOLUTION: "rolled-back",
    PROBE_MODE: "success",
  });
  assert(
    !resolveFailure.includes("resolve:applied") &&
      !resolveFailure.includes("probe:resolved"),
    "rolled-back failure reached apply or resolved probe",
  );
  const deployResolveFailure = runCase("deploy-resolve-failure", {
    CASE: "deploy",
    FAIL_RESOLUTION: "rolled-back",
    PROBE_MODE: "success",
  });
  assert(
    !deployResolveFailure.includes("migrate") &&
      !deployResolveFailure.includes("probe:post") &&
      !deployResolveFailure.includes("admin:post"),
    "resolve failure reached migration or a post-migration step",
  );
  const retryFailure = runCase("retry-failure", {
    CASE: "deploy",
    PROBE_MODE: "retry-failure",
  });
  assert(
    retryFailure.includes("resolve:rolled-back") &&
      !retryFailure.includes("resolve:applied") &&
      !retryFailure.includes("probe:resolved") &&
      !retryFailure.includes("migrate") &&
      !retryFailure.includes("probe:post") &&
      !retryFailure.includes("admin:post"),
    "retry preflight failure reached apply, migration, or post",
  );
  const applyFailure = runCase("apply-failure", {
    CASE: "deploy",
    FAIL_RESOLUTION: "applied",
    PROBE_MODE: "apply",
  });
  assert(
    !applyFailure.includes("probe:resolved") &&
      !applyFailure.includes("migrate") &&
      !applyFailure.includes("probe:post") &&
      !applyFailure.includes("admin:post"),
    "applied resolve failure reached resolved, migration, or post",
  );
  const migrateFailure = runCase("migrate-failure", {
    CASE: "deploy",
    MIGRATE_STATUS: "1",
    PROBE_MODE: "apply",
  });
  assert(
    migrateFailure.includes("migrate") &&
      !migrateFailure.includes("probe:post") &&
      !migrateFailure.includes("admin:post"),
    "migrate failure reached a post-migration step",
  );
  rmSync(directory, { recursive: true, force: true });
};
