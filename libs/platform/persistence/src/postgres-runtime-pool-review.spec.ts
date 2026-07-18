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
    const backend = deploy.slice(
      deploy.indexOf('deploy_backend()'),
      deploy.indexOf('switch_link()'),
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

    expect(deploy).toContain('POSTGRES_ADMISSION_LOCK');
    expect(removal).toBeGreaterThanOrEqual(0);
    expect(liveAdmission).toBeGreaterThan(removal);
    expect(envelopeProbe).toBeGreaterThan(liveAdmission);
    expect(replacement).toBeGreaterThan(removal);
    expect(replacement).toBeGreaterThan(envelopeProbe);
    expect(deploy).toContain('docker rm -f "${container_ids[@]}"');
    expect(backend).toMatch(
      /persistent\+=\([\s\S]*?api ingestion-worker intelligence-worker delivery-service event-relay[\s\S]*?\)/,
    );
    expect(deploy).toContain(
      'label=com.docker.compose.project=$PROJECT',
    );
    expect(deploy).toContain(
      'label=com.docker.compose.service=$service',
    );
    expect(deploy).toContain(
      'restore_postgres_runtime_control "$runtime_control_backup"',
    );
    expect(deploy).toContain(
      'rollback_backend_images "$previous_images"',
    );
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
    expect(workflow).toContain(
      '"$CONTROL_CHANGED" "$POSTGRES_POOL_BOOTSTRAP"',
    );
    expect(deployClient).toMatch(
      /if \[\[ \$PLAN_BACKEND == true &&[\s\S]*?\$PLAN_POSTGRES_POOL_BOOTSTRAP != "\$POSTGRES_POOL_BOOTSTRAP_VERSION" \]\]; then[\s\S]*?fail /,
    );
    expect(deployClient).toMatch(
      /if \[\[ \$control_changed == true && \$bootstrap == uninstalled \]\]; then\s+for attempt in 1 2 3; do/,
    );
    expect(deployClient).toMatch(
      /plan_is_fully_reconciled\(\) \{[\s\S]*?\$PLAN_BACKEND == false[\s\S]*?\$PLAN_CONTROL == false[\s\S]*?\$PLAN_POSTGRES_POOL_BOOTSTRAP == "\$POSTGRES_POOL_BOOTSTRAP_VERSION"[\s\S]*?\$PLAN_POSTGRES_POOL_BOOTSTRAP_SHA != "\$ZERO_SHA"/,
    );
    expect(transitionTest.indexOf('TEST_PHASE=legacy-poison-window')).toBeLessThan(
      transitionTest.indexOf('TEST_PHASE=legacy-repair'),
    );
    expect(transitionTest.indexOf('TEST_PHASE=legacy-repair')).toBeLessThan(
      transitionTest.indexOf('TEST_PHASE=bootstrap-commit'),
    );
    expect(transitionTest.match(/assert_release_a_non_activation/g)).toHaveLength(
      4,
    );
    expect(workflow).toContain(
      'verify-postgres-pool-release-contract.py ci',
    );
  });

  it('requires database-aware readiness and a restart/proxy soak before the marker', () => {
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
    expect(deploy.indexOf('soak_backend_release')).toBeLessThan(
      deploy.lastIndexOf('printf \'%s\\n\' "$sha" > "$STATE/backend.sha"'),
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
