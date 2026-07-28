import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  defaultPostgresRuntimePoolConfig,
  toPostgresPoolConfig,
} from './postgres-runtime-pool-config';

describe('hostile PostgreSQL pool budget review', () => {
  it('pins an explicit zero pool minimum while URL pool hints cannot raise max', () => {
    const config = defaultPostgresRuntimePoolConfig(
      'postgresql://review-user:raw-password@runtime.invalid/social_monitor?connection_limit=99&pool_timeout=120',
      'api-gateway',
    );

    expect(toPostgresPoolConfig(config)).toMatchObject({
      application_name: 'social-monitor/runtime/api-gateway',
      min: 0,
      max: 2,
    });
  });

  it('requires rendered topology and live PostgreSQL capacity before deployment', () => {
    const deploy = readFileSync(
      join(process.cwd(), 'ops/deploy/social-monitor-production-deploy.sh'),
      'utf8',
    );
    const deployLibrary = readFileSync(
      join(process.cwd(), 'ops/deploy/postgres-runtime-deploy-lib.sh'),
      'utf8',
    );
    const verifier = readFileSync(
      join(
        process.cwd(),
        'ops/deploy/verify-postgres-runtime-topology.py',
      ),
      'utf8',
    );

    expect(verifier).toContain('POSTGRES_RUNTIME_PROCESS');
    expect(verifier).toContain('POSTGRES_RUNTIME_POOL_MIN');
    expect(verifier).toContain('POSTGRES_RUNTIME_POOL_MAX');
    expect(verifier).toMatch(/replicas|scale/);
    expect(verifier).toContain('serverMaxConnections');
    expect(verifier).toContain('superuserReservedConnections');
    expect(verifier).toContain('roleConnectionLimit');
    expect(verifier).toContain('databaseConnectionLimit');
    expect(verifier).toContain('externalConnectionOccupancy');
    expect(verifier).toContain('stoppedRuntimeConnectionOccupancy');
    expect(verifier).toContain(
      'post-old-container-stop-pre-new-start',
    );
    expect(verifier).toContain('MINIMUM_PROVIDER_RESERVE = 5');
    expect(verifier).toContain('MINIMUM_PROVIDER_RESERVE_RATIO = 0.20');
    expect(verifier).toContain('FORBIDDEN_OPERATOR_CAPACITY_CLAIMS');
    expect(verifier).toContain('maximum_application_connections');
    expect(verifier).toContain('provider_headroom');
    expect(deploy).toContain(
      'verify_live_postgres_admission "$postgres_env"',
    );
    expect(deploy).toContain('probe_postgres_maximum_envelope "$postgres_env"');
    expect(deployLibrary).toContain('"$ROOT/secrets/production.env"');
    expect(deployLibrary).toContain(
      "current_setting('max_connections')::integer",
    );
    expect(deployLibrary).toContain("'externalConnectionOccupancy'");
    expect(deployLibrary).toContain("'stoppedRuntimeConnectionOccupancy'");
    expect(deployLibrary).toContain(
      'social-monitor/runtime/api-gateway',
    );
    expect(deploy).not.toContain('provider_capacity = required_integer');
  });

  it('removes replaced database containers before starting replacements', () => {
    const deploy = readFileSync(
      join(process.cwd(), 'ops/deploy/social-monitor-production-deploy.sh'),
      'utf8',
    );
    const rescueLibrary = readFileSync(
      join(process.cwd(), 'ops/deploy/backend-image-rescue-lib.sh'),
      'utf8',
    );
    const dockerMaintenanceLibrary = readFileSync(
      join(process.cwd(), 'ops/deploy/docker-maintenance-lib.sh'),
      'utf8',
    );
    const backend = deploy.slice(
      deploy.indexOf('deploy_backend()'),
      deploy.indexOf('switch_link()'),
    );
    const releaseTransaction = deploy.slice(
      deploy.indexOf('deploy_release_runtime_transaction()'),
      deploy.indexOf('sync_control_script()'),
    );
    const rollbackHelper = rescueLibrary.slice(
      rescueLibrary.indexOf('rollback_backend_and_runtime_control()'),
      rescueLibrary.indexOf('\nbackend_image_rescue_cleanup()'),
    );
    const databaseServiceRemovalHelper = dockerMaintenanceLibrary.slice(
      dockerMaintenanceLibrary.indexOf('stop_and_remove_database_services()'),
    );
    const removal = backend.indexOf(
      'stop_and_remove_database_services "${persistent[@]}"',
    );
    const replacement = backend.indexOf(
      'up -d --no-deps --force-recreate "${persistent[@]}"',
    );
    const liveAdmission = backend.indexOf(
      'verify_live_postgres_admission "$postgres_env"',
    );
    const envelopeProbe = backend.indexOf(
      'probe_postgres_maximum_envelope "$postgres_env"',
    );
    const rollbackCall = releaseTransaction.indexOf(
      'rollback_backend_and_runtime_control',
    );
    const incompleteRollbackFailure = releaseTransaction.indexOf(
      "fail 'release failed; rollback is incomplete and rescue tags were preserved'",
    );
    const restoredRollbackFailure = releaseTransaction.indexOf(
      "fail 'release failed; backend images and PostgreSQL runtime control were restored'",
    );
    const backendImageRollback = rollbackHelper.indexOf(
      'rollback_backend_images "$state_file"',
    );
    const runtimeControlRestore = rollbackHelper.indexOf(
      'restore_postgres_runtime_control "$runtime_control_backup"',
    );
    const dockerMaintenanceSource = deploy.indexOf(
      "source_deploy_library docker-maintenance-lib.sh 'docker maintenance library'",
    );

    expect(deploy).toContain('POSTGRES_ADMISSION_LOCK');
    expect(dockerMaintenanceSource).toBeGreaterThanOrEqual(0);
    expect(dockerMaintenanceSource).toBeLessThan(
      deploy.indexOf('deploy_backend()'),
    );
    expect(removal).toBeGreaterThanOrEqual(0);
    expect(liveAdmission).toBeGreaterThan(removal);
    expect(envelopeProbe).toBeGreaterThan(liveAdmission);
    expect(replacement).toBeGreaterThan(removal);
    expect(replacement).toBeGreaterThan(envelopeProbe);
    expect(databaseServiceRemovalHelper).toContain(
      'docker rm -f "${container_ids[@]}" || return 1',
    );
    expect(backend).toMatch(
      /persistent\+=\([\s\S]*?api ingestion-worker intelligence-worker delivery-service event-relay[\s\S]*?\)/,
    );
    expect(databaseServiceRemovalHelper).toContain(
      'label=com.docker.compose.project=$PROJECT',
    );
    expect(databaseServiceRemovalHelper).toContain(
      'label=com.docker.compose.service=$service',
    );
    expect(rollbackCall).toBeGreaterThanOrEqual(0);
    expect(incompleteRollbackFailure).toBeGreaterThan(rollbackCall);
    expect(restoredRollbackFailure).toBeGreaterThan(rollbackCall);
    expect(deploy).not.toContain(
      'restore_postgres_runtime_control "$runtime_control_backup"',
    );
    expect(rollbackHelper).toContain('rollback_backend_and_runtime_control()');
    expect(backendImageRollback).toBeGreaterThanOrEqual(0);
    expect(runtimeControlRestore).toBeGreaterThan(backendImageRollback);
  });

  it('requires the fail-closed bridge transition before the first backend release', () => {
    const workflow = readFileSync(
      join(process.cwd(), '.github/workflows/production-deploy.yml'),
      'utf8',
    );
    const deploy = readFileSync(
      join(process.cwd(), 'ops/deploy/social-monitor-production-deploy.sh'),
      'utf8',
    );
    const deployClient = readFileSync(
      join(process.cwd(), 'ops/deploy/github-production-deploy-client.sh'),
      'utf8',
    );
    const deployControl = readFileSync(
      join(process.cwd(), 'ops/deploy/deploy-control-lib.sh'),
      'utf8',
    );
    const atomicBootstrap = readFileSync(
      join(
        process.cwd(),
        'ops/deploy/postgres-pool-atomic-bootstrap-lib.sh',
      ),
      'utf8',
    );
    const sshWrapper = readFileSync(
      join(
        process.cwd(),
        'ops/deploy/social-monitor-production-ssh-wrapper.sh',
      ),
      'utf8',
    );
    const transitionTest = readFileSync(
      join(
        process.cwd(),
        'ops/deploy/postgres-pool-bootstrap-transition.test.sh',
      ),
      'utf8',
    );

    expect(deploy).toContain(
      'POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1',
    );
    expect(deploy).toContain('postgres_pool_bootstrap=%s');
    expect(workflow).toContain(
      'bash ops/deploy/github-production-deploy-client.test.sh',
    );
    expect(workflow).toContain(
      'bash ops/deploy/postgres-pool-bootstrap-transition.test.sh || bootstrap_status=$?',
    );
    expect(workflow).toContain(
      'bash ops/deploy/github-production-deploy-client.sh deploy "$GITHUB_SHA"',
    );
    expect(workflow).not.toContain(
      '"$CONTROL_CHANGED" "$POSTGRES_POOL_BOOTSTRAP"',
    );
    expect(deployClient).toMatch(
      /repair_missing_postgres_pool_bootstrap\(\)[\s\S]*?run_remote deploy "\$sha"[\s\S]*?capture_plan "\$sha"[\s\S]*?\$PLAN_POSTGRES_POOL_BOOTSTRAP_SHA == "\$sha"[\s\S]*?\$PLAN_BACKEND_BASE == "\$durable_backend_base"[\s\S]*?\$PLAN_BACKEND == true/,
    );
    expect(deployClient).toMatch(
      /deploy_release\(\) \{[\s\S]*?deploy_once "\$sha"/,
    );
    expect(deployControl).toMatch(
      /deploy_release\(\) \{[\s\S]*?postgres_pool_atomic_legacy_state[\s\S]*?deploy_postgres_pool_atomic_control_bootstrap "\$sha"[\s\S]*?return[\s\S]*?exec 9>"\$DEPLOY_LOCK"/,
    );
    expect(atomicBootstrap).toContain('exec 9>"$DEPLOY_LOCK"');
    expect(atomicBootstrap).toContain(
      'verify_postgres_pool_atomic_repair_target "$sha" "$adoption_backend"',
    );
    expect(atomicBootstrap).toContain(
      'PostgreSQL bootstrap marker must be absent for atomic repair',
    );
    expect(sshWrapper).toContain(
      '^(plan|upload|deploy|disk-report|project-disk-cleanup|reader-summary-recover-missing-days|reader-summary-weekly-run)$',
    );
    expect(sshWrapper).not.toContain('bootstrap-postgres-pool');
    expect(transitionTest.indexOf('TEST_PHASE=legacy-poison-window')).toBeLessThan(
      transitionTest.indexOf('TEST_PHASE=legacy-repair'),
    );
    expect(transitionTest.indexOf('TEST_PHASE=legacy-repair')).toBeLessThan(
      transitionTest.indexOf('TEST_PHASE=bootstrap-commit'),
    );
    for (const phase of [
      'legacy-poison-window',
      'legacy-repair',
      'bootstrap-commit',
    ]) {
      const phaseMarker = `TEST_PHASE=${phase}`;
      const phaseStart = transitionTest.indexOf(phaseMarker);
      const nextPhaseStart = transitionTest.indexOf(
        '\nTEST_PHASE=',
        phaseStart + phaseMarker.length,
      );

      expect(phaseStart).toBeGreaterThanOrEqual(0);
      expect(nextPhaseStart).toBeGreaterThan(phaseStart);
      expect(
        transitionTest.slice(
          phaseStart + phaseMarker.length,
          nextPhaseStart,
        ),
      ).toMatch(/^assert_release_a_non_activation[ \t]*$/m);
    }
    expect(workflow).toContain(
      'verify-postgres-pool-release-contract.py ci',
    );
  });

  it('requires database-aware readiness and an atomic marker after activation and soak', () => {
    const deploy = readFileSync(
      join(process.cwd(), 'ops/deploy/social-monitor-production-deploy.sh'),
      'utf8',
    );
    const deployLibrary = readFileSync(
      join(process.cwd(), 'ops/deploy/postgres-runtime-deploy-lib.sh'),
      'utf8',
    );
    const reporter = readFileSync(
      join(process.cwd(), 'apps/api-gateway/src/health-reporter.ts'),
      'utf8',
    );
    const pool = readFileSync(
      join(process.cwd(), 'libs/platform/persistence/src/postgres-runtime-pool.ts'),
      'utf8',
    );
    const backend = deploy.slice(
      deploy.indexOf('deploy_backend()'),
      deploy.indexOf('switch_link()'),
    );
    const releaseTransaction = deploy.slice(
      deploy.indexOf('deploy_release_runtime_transaction()'),
      deploy.indexOf('sync_control_script()'),
    );
    const soak = backend.indexOf(
      '! soak_backend_release "${persistent[@]}" frontend caddy; then',
    );
    const activation = releaseTransaction.indexOf(
      'activate_postgres_runtime_control "$sha" "$compatible_backend_sha"',
    );
    const backendDeployment = releaseTransaction.indexOf('deploy_backend "$sha"');
    const activationResult = releaseTransaction.indexOf('activation_status=$?');
    const restoredRollbackFailure = releaseTransaction.indexOf(
      "fail 'release failed; backend images and PostgreSQL runtime control were restored'",
    );
    const markerWrite = releaseTransaction.indexOf(
      'printf \'%s\\n\' "$sha" > "$STATE/backend.sha.next"',
    );
    const markerCommit = releaseTransaction.indexOf(
      'mv -f "$STATE/backend.sha.next" "$STATE/backend.sha"',
    );

    expect(reporter).toMatch(
      /(?:await|return)\s+this\.databaseReadiness\.check\(\)/,
    );
    expect(pool).toContain('SELECT 1::integer AS readiness_probe');
    expect(deploy).toContain('POSTGRES_ROLLOUT_SOAK_SECONDS=300');
    expect(deploy).toContain('verify_backend_proxy_readiness');
    expect(deployLibrary).toContain("'{{.RestartCount}}'");
    expect(deploy).toContain('verify_concurrent_backend_readiness');
    expect(deploy).toContain('verify_backend_soak_logs');
    expect(deploy).toContain('verify_ingestion_queue_recovery');
    expect(deployLibrary).toContain('BEGIN READ ONLY; SELECT 1; SELECT pg_sleep(12); COMMIT');
    expect(deployLibrary).toContain('[ "$observed" -eq 16 ]');
    expect(soak).toBeGreaterThanOrEqual(0);
    expect(activation).toBeGreaterThanOrEqual(0);
    expect(backendDeployment).toBeGreaterThan(activation);
    expect(activationResult).toBeGreaterThan(backendDeployment);
    expect(markerWrite).toBeGreaterThan(restoredRollbackFailure);
    expect(markerWrite).toBeGreaterThan(activationResult);
    expect(markerCommit).toBeGreaterThan(markerWrite);
    expect(releaseTransaction).not.toContain(
      'printf \'%s\\n\' "$sha" > "$STATE/backend.sha"',
    );
  });

  it('makes real Prisma query and held-transaction concurrency mandatory in release CI', () => {
    const prismaConcurrency = readFileSync(
      join(
        process.cwd(),
        'libs/platform/persistence/src/postgres-runtime-pool-prisma-concurrency.spec.ts',
      ),
      'utf8',
    );
    const workflow = readFileSync(
      join(process.cwd(), '.github/workflows/production-deploy.yml'),
      'utf8',
    );

    expect(prismaConcurrency).toContain('$queryRaw');
    expect(prismaConcurrency).toContain('$transaction');
    expect(prismaConcurrency).toContain('holdTransaction');
    expect(workflow).toContain('postgres:18.4-alpine');
    expect(workflow).toContain(
      'npm run check:postgres-runtime-pool-inventory',
    );
    expect(workflow).toContain('npm run check:postgres-runtime-pool-unit');
    expect(workflow).toContain(
      'npm run check:postgres-runtime-pool-prisma-concurrency',
    );
  });

  it('keeps queue quiescing ahead of WorkerRuntime drain and requeues backpressure', () => {
    const worker = readFileSync(
      join(process.cwd(), 'libs/platform/worker/src/worker-runtime.ts'),
      'utf8',
    );
    const queueLoop = readFileSync(
      join(
        process.cwd(),
        'apps/intelligence-worker/src/summary-job-queue-drain-loop.ts',
      ),
      'utf8',
    );
    const ingestionQueueLoop = readFileSync(
      join(
        process.cwd(),
        'apps/ingestion-worker/src/scan-queue-drain-loop.ts',
      ),
      'utf8',
    );

    expect(queueLoop).toContain('onModuleDestroy(');
    expect(worker).toContain('beforeApplicationShutdown(');
    expect(worker).toMatch(
      /onApplicationShutdown[\s\S]*?return this\.beforeApplicationShutdown\(signal\)/,
    );
    expect(worker).toContain(
      'worker drain threshold exceeded; continuing to wait before resource shutdown',
    );
    expect(queueLoop).toContain("error.code === 'operation.backpressure'");
    expect(queueLoop).toContain('delivery.nack({ requeue: true })');
    expect(worker).toContain('postgres.too_many_connections');
    expect(worker).toContain("['code', 'sqlState', 'sqlstate', 'originalCode']");
    expect(worker).toContain('redactSensitiveText');
    expect(ingestionQueueLoop).toContain('classifyWorkerRuntimeFailure(error)');
    expect(ingestionQueueLoop).toContain('errorClassification: failure.classification');
    expect(ingestionQueueLoop).toContain('errorCode: failure.code');
  });
});
