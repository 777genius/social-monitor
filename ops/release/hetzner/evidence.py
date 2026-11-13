"""Fail-closed policies for independently gathered release, SQL and backup evidence."""
import re
import time
from prisma_history import summarize, timestamp
from contract import DIGEST, digest, fresh, require

WORKER_README = 'apps/agent-runtime/README.md'
PACKAGE_CHECK = 'check:source-live-certification-evidence'

REVIEW_BASE = '81eca6a156ca890545a3c7219a7d9e6788476731'
REVIEW_HEAD = '231421b6b2ffe06a5cce9fa4af079e33ad8a7cdf'
REVIEW_DIGEST = 'sha256:4328f7712a0303c69f937e7f29a82949a7535be92c9b3d2ff1b56f7d69203be3'
REVIEW_PATHS = frozenset((
    'apps/x-collector/src/x_collector/grpc_service.py',
    'apps/x-collector/src/x_collector/rpc_drain.py',
    'apps/x-collector/src/x_collector/server.py',
    'apps/x-collector/tests/test_grpc_failure_diagnostic.py',
    'apps/x-collector/tests/test_health_monitor.py',
    'apps/x-collector/tests/test_rpc_drain_grpc.py',
    'apps/x-collector/tests/test_rpc_drain_shutdown.py',
    'apps/x-collector/tests/test_rpc_drain_synthetic.py',
    'libs/ingestion/adapters/source/hacker-news/hacker-news-client.port.ts',
    'libs/ingestion/adapters/source/hacker-news/hacker-news-multi-pass-collector.ts',
    'libs/ingestion/adapters/source/hacker-news/hacker-news-open-window-completeness.spec.ts',
    'libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider.spec.ts',
    'libs/ingestion/adapters/source/hacker-news/http-hacker-news-client.ts',
    'libs/ingestion/adapters/source/reddit/reddit-historical-partial-scan.spec.ts',
    'libs/ingestion/adapters/source/reddit/reddit-multi-pass-collector.ts',
    'scripts/lib/clean-real-day-provider-acquisition.ts',
    'scripts/lib/clean-real-day-source-config-reader.spec.ts',
    'scripts/lib/clean-real-day-source-config-reader.ts',
))

# Narrow compatibility review of the merged GitHub Trending identity change.
REVIEW_746_BASE = 'c2ea8b7b8b33786b1ce5580c59a3bd5d29fac54b'
REVIEW_746_HEAD = 'b1a87f64fd414317a0f2cb5ceae6932133206c00'
REVIEW_746_DIGEST = 'sha256:c05fb6e0822fbfa509b5b56a63ee6f18f8d281585021224f2c29ee77e58c5b15'
REVIEW_746_PATHS = frozenset((
    'docs/iterations/2026-11-11-github-trending-runtime-smoke.md',
    'docs/iterations/2026-11-11-source-live-provider-evidence-validation.md',
    'libs/ingestion/adapters/persistence/github-trending-source-identities.ts',
    'libs/ingestion/adapters/persistence/in-memory-source-item.repository.ts',
    'libs/ingestion/adapters/persistence/prisma/prisma-ingestion-client.ts',
    'libs/ingestion/adapters/persistence/prisma/prisma-source-item-batch-writer.ts',
    'libs/ingestion/adapters/persistence/prisma/prisma-source-item.repository.spec.ts',
    'libs/ingestion/adapters/source/github-trending-page/github-trending-page-snapshot-integrity.spec.ts',
    'libs/ingestion/domain/value-objects/github-trending-page.ts',
    'package.json',
    'scripts/check-source-line-cap.mjs',
    'scripts/check-source-live-certification-evidence.mjs',
    'scripts/check-source-provider-runtime-contract.ts',
    'scripts/ci/source-provider-github-trending-runtime-gate.test.mjs',
    'scripts/lib/source-live-certification-evidence-shape.test.mjs',
    'scripts/lib/source-live-provider-evidence-validation.mjs',
    'scripts/lib/source-live-provider-evidence-validation.test.mjs',
    'scripts/lib/source-provider-github-trending-runtime-smoke.ts',
))

# These are the only .mjs sources copied by the pinned Dockerfile below.
PACKAGE_COPIED_MJS = {'scripts/rewrite-build-aliases.mjs', 'scripts/run-with-timeout.mjs'}
# These exact CI sources are absent from the pinned Dockerfile's COPY closure.
PACKAGE_CI_TS = {'scripts/check-source-provider-runtime-contract.ts',
                 'scripts/capture-durable-backend-e2e-loop.ts',
                 'scripts/lib/durable-backend-e2e-scan-targets.ts',
                 'scripts/lib/source-provider-github-issues-runtime-smoke.ts',
                 'scripts/lib/source-provider-github-trending-runtime-smoke.ts'}


def package_check_key(key):
    return isinstance(key, str) and re.fullmatch(r'check:[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}', key) is not None


def package_ci_path(path):
    return (path == 'package.json' or path in PACKAGE_CI_TS or path.startswith(('docs/', 'ops/release/')) or
            path.startswith('scripts/') and path.endswith('.mjs') and path not in PACKAGE_COPIED_MJS or
            path.startswith(('scripts/ci/', 'ops/ci/')) and path.endswith('.mts'))


# Reviewed direct build closure: npm ci; npm run prisma:generate; npm run build;
# runtime CMD executes node directly. A new build contract needs a separate review.
PACKAGE_BUILD = {
    'files': {'Dockerfile': 'ec1487f1442ddd7a965f924bc3a3f889eb857239',
        'scripts/rewrite-build-aliases.mjs': '1155417025d95054290792f498b168051ff08d3e',
        'prisma.config.ts': '188ca3530882cbfaf2c6447ca9db04b1433e68c2',
        'tsconfig.build.json': '9ef33781c0953cd4485e380de32dec7e47dae5c8',
        'tsconfig.json': 'de2385308366a040932befc7bc30a37876609212'},
    'scripts': {'build': 'tsc -p tsconfig.build.json && node scripts/rewrite-build-aliases.mjs -p tsconfig.build.json',
                'prisma:generate': 'prisma generate --schema prisma/schema.prisma'},
    'absent_hooks': ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare',
                     'dependencies', 'prebuild', 'postbuild', 'preprisma:generate', 'postprisma:generate'],
}


def package_script_proof(proof, base, head, delta):
    require(isinstance(proof, dict) and set(proof) == {'base', 'head', 'delta_sha256', 'changed_scripts',
            'before_blob', 'after_blob', 'before_sha256', 'after_sha256', 'build_contract_sha256'}
            and proof['base'] == base and proof['head'] == head and proof['delta_sha256'] == delta
            and isinstance(proof['changed_scripts'], list) and proof['changed_scripts']
            and all(package_check_key(key) for key in proof['changed_scripts'])
            and proof['changed_scripts'] == sorted(set(proof['changed_scripts']))
            and proof['build_contract_sha256'] == digest(PACKAGE_BUILD), 'backend-sensitive-files')
    require(all(isinstance(proof[k], str) and re.fullmatch(r'[0-9a-f]{40}', proof[k])
                for k in ('before_blob', 'after_blob')) and
            all(isinstance(proof[k], str) and re.fullmatch(DIGEST, proof[k])
                for k in ('before_sha256', 'after_sha256')), 'backend-sensitive-files')


def backend_compatibility(evidence, revisions, candidate, snapshot):
    """New fixed cohort policy; no assertions of independent human approval."""
    require(evidence.get('policy') == 'backend-cohort-ci-v1' and
            evidence.get('non_target_snapshot_sha256') == snapshot and
            evidence.get('api_revision') == revisions['api'] and
            evidence.get('worker_revision') == revisions['jev-intelligence-worker'] and
            evidence.get('main_sha') == candidate and evidence.get('head_sha') == candidate and
            evidence.get('event') == 'push' and evidence.get('branch') == 'main' and
            evidence.get('legacy_workflow') == 'disabled_manually' and
            isinstance(evidence.get('jobs'), list) and evidence['jobs'] and
            all(status == 'success' for status in evidence['jobs']), 'backend-ci')
    deltas = evidence.get('deltas')
    require(isinstance(deltas, dict) and set(deltas) == set(revisions), 'backend-deltas')
    for service, base in revisions.items():
        delta = deltas[service]
        require(delta.get('base') == base and delta.get('head') == candidate and
                delta.get('complete_delta') is True and re.fullmatch(DIGEST, delta.get('delta_sha256', '')),
                'backend-delta-binding')
        paths = delta.get('changed_paths')
        require(isinstance(paths, list) and all(isinstance(p, str) and p and '..' not in p.split('/')
                and not p.startswith('/') for p in paths) and (paths or base == candidate), 'backend-delta-paths')
        reviewed = None
        review_paths = frozenset()
        reviews = (('reviewed_231421', REVIEW_BASE, REVIEW_DIGEST, REVIEW_PATHS),
                   ('reviewed_746', REVIEW_746_BASE, REVIEW_746_DIGEST, REVIEW_746_PATHS))
        for field, expected_base, expected_digest, expected_paths in reviews:
            proof = delta.get(field)
            if proof is None:
                continue
            require(reviewed is None and base == expected_base and isinstance(proof, dict) and
                    set(proof) == {'base', 'head', 'delta_sha256', 'review_delta_sha256', 'continuation'} and
                    proof['base'] == base and proof['head'] == candidate and
                    proof['delta_sha256'] == delta['delta_sha256'] and
                    proof['review_delta_sha256'] == expected_digest and
                    isinstance(proof['continuation'], list) and
                    all(isinstance(p, str) and package_ci_path(p) and p not in expected_paths
                        for p in proof['continuation']) and
                    paths == sorted(expected_paths | set(proof['continuation'])),
                    'backend-sensitive-files')
            reviewed, review_paths = proof, expected_paths
        allowed = lambda p: package_ci_path(p) or reviewed is not None and p in review_paths
        if 'package.json' in paths:
            require(all(allowed(p) for p in paths),
                    'backend-sensitive-files')
            package_script_proof(delta.get('package_scripts'), base, candidate, delta['delta_sha256'])
        # Shared libs also run in retained consumers (including summary via delivery
        # composition). Current-version CI does not prove mixed-version compatibility.
        # This limited lane refuses all shared-library changes; it is not an all-backend
        # automatic release. Compose source is not activated:
        # only immutable host roots, runtime fingerprints and two image fields are used.
        denied = ('prisma/', 'libs/', 'apps/ingestion-worker/', 'apps/agent-runtime/',
                  'apps/x-collector/', 'apps/delivery-service/', 'apps/event-relay/')
        lifecycle = {'Dockerfile', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json',
            'scripts/rewrite-build-aliases.mjs',
            'apps/intelligence-worker/src/main.ts',
            'apps/intelligence-worker/src/worker-shutdown-marker.ts',
            'apps/intelligence-worker/src/worker-shutdown-marker.spec.ts',
            'apps/intelligence-worker/src/intelligence-worker.module.spec.ts',
            'apps/intelligence-worker/src/worker-shutdown-signal.spec.ts',
            'apps/intelligence-worker/src/worker-shutdown-signal.fixture.mts',
            'apps/intelligence-worker/src/worker-shutdown-signal.fixture.cts'}
        require(not any(not p.startswith('docs/') and p != WORKER_README and
                ((p in lifecycle and p != 'package.json') or p.startswith(denied) or p.rsplit('/', 1)[-1] == 'schema.prisma' or
                 '/prisma/migrations/' in p) and not (reviewed is not None and p in review_paths) for p in paths), 'backend-sensitive-files')
    return {'policy': 'backend-cohort-ci-v1', 'deltas': deltas,
            'run_attempt': evidence['run_attempt'], 'jobs_sha256': digest(evidence['job_observations'])}


def compatibility(evidence, revision, candidate):
    require(evidence.get('production_revision') == revision
            and evidence.get('diff_base') == revision and evidence.get('diff_head') == candidate
            and evidence.get('complete_delta') is True, 'compatibility-base')
    paths = evidence.get('changed_paths')
    require(isinstance(paths, list) and paths and all(isinstance(p, str) and p
            and '..' not in p.split('/') and not p.startswith('/') for p in paths), 'changed-path-evidence')
    # Only product code/config roots are risky; prose mentioning workers is harmless.
    denied = ('prisma/', 'apps/intelligence-worker/', 'apps/ingestion-worker/',
              'apps/agent-runtime/', 'apps/x-collector/', 'libs/agent-runtime/', 'ops/compose/')
    def sensitive(path):
        if path.startswith('docs/') or path == WORKER_README:
            return False
        leaf = path.rsplit('/', 1)[-1]
        return path.startswith(denied) or leaf == 'schema.prisma' or '/prisma/migrations/' in path \
            or bool(re.fullmatch(r'(?:docker-compose|compose)(?:[.-][a-zA-Z0-9_-]+)*\.ya?ml', leaf))
    require(not any(sensitive(p) for p in paths), 'sensitive-files')
    delta = evidence.get('delta_sha256', '')
    require(re.fullmatch(DIGEST, delta), 'compatibility-delta')
    proof = evidence.get('compatibility')
    require(isinstance(proof, dict) and proof.get('base') == revision
            and proof.get('head') == candidate and proof.get('delta_sha256') == delta
            and proof.get('paths_sha256') == digest(paths)
            and proof.get('independent_review') is True
            and proof.get('all_shared_dependencies_reviewed') is True
            and proof.get('compatible') is True and re.fullmatch(DIGEST, proof.get('evidence_sha256', '')),
            'compatibility-unreviewed')
    return {'production_revision': revision, 'delta_sha256': delta,
            'paths_sha256': digest(paths), 'compatibility_sha256': digest(proof)}


def historical_database(evidence, migrations, system_identifier=None):
    """Validate retained observation authority and every attempt, without live age checks."""
    require(isinstance(evidence, dict), 'database-evidence')
    require(type(evidence.get('server_major')) is int and evidence['server_major'] == 18
            and evidence.get('read_only_role') is True
            and evidence.get('transaction_read_only') is True, 'database-evidence')
    proof = evidence.get('history')
    applied, failed = summarize(proof)
    require(all(proof[k] == evidence.get(k) for k in
                ('system_identifier', 'database', 'observer_role', 'port'))
            and (system_identifier is None or proof['system_identifier'] == system_identifier),
            'history-binding')
    require(type(evidence.get('observed_at')) is int and evidence['observed_at'] >= 0
            and timestamp(proof['observed_at']).timestamp() <= evidence['observed_at'] + 1,
            'stale-evidence')
    require(evidence.get('applied_migrations') == applied and evidence.get('failed_migrations') == failed,
            'history-summary')
    require(not failed, 'database-evidence')
    actual = [{'name': r['name'], 'checksum': r['checksum']} for r in applied]
    require(actual == migrations, 'migration-required')
    # Persist only the finite observation contract, including every attempt.
    fields = ('server_major', 'system_identifier', 'database', 'observer_role', 'port',
              'read_only_role', 'transaction_read_only', 'history', 'applied_migrations',
              'failed_migrations', 'observed_at', 'version', 'sha', 'ci_run_id', 'archive_sha256', 'image_id')
    return {k: evidence[k] for k in fields if k in evidence}


def database(evidence, migrations, system_identifier=None, max_age=300):
    observation = historical_database(evidence, migrations, system_identifier)
    observed = timestamp(observation['history']['observed_at']).timestamp()
    require(0 <= time.time() - observed <= max_age
            and 0 <= observation['observed_at'] + 1 - observed <= max_age + 1, 'stale-evidence')
    return observation


def backup(evidence, binding, config, lane='migration-free', live=None, config_hash=None):
    fresh(evidence.get('verified_at'), config['evidence_max_age_seconds'])
    fresh(evidence.get('completed_at'), config['backup_max_age_seconds'])
    require(evidence.get('receipt_digest') == digest(binding), 'backup-receipt-binding')
    bound = {}
    fields = ('format', 'reference', 'completed_at', 'verified_at', 'receipt_digest')
    if evidence.get('format') == 'pgbackrest-full':
        extra = ('stanza', 'repository', 'backup_id', 'started_at', 'stop', 'status_code',
                 'error', 'backup_type', 'server_major', 'pgbackrest_version', 'wrapper')
        require(evidence.get('backup_type') == 'full' and evidence.get('status_code') == 0
                and type(evidence.get('status_code')) is int and evidence.get('error') is False
                and evidence.get('server_major') == 18
                and type(evidence.get('started_at')) is int
                and type(evidence.get('stop')) is int
                and 0 <= evidence['started_at'] <= evidence['completed_at'] == evidence.get('stop'), 'backup-unverified')
        require(all(isinstance(evidence.get(k), str) and re.fullmatch(r'[a-zA-Z0-9_.-]{1,100}', evidence[k])
                    for k in ('stanza', 'repository', 'pgbackrest_version'))
                and re.fullmatch(r'[0-9]{8}-[0-9]{6}F', evidence.get('backup_id', ''))
                and evidence.get('reference') == 'pgbackrest:{stanza}:{repository}:{backup_id}'.format(**evidence),
                'backup-reference')
        bound = backup_identity(evidence, config, live, config_hash)
    else:
        # A distinct, separately approved lane may reuse this validator; never this controller.
        require(lane == 'approved-migration' and evidence.get('format') == 'pg_dump-Fc', 'backup-lane')
        extra = ('restore_list_ok', 'sha256_verified', 'backup_sha256')
        require(evidence.get('restore_list_ok') is True and evidence.get('sha256_verified') is True
                and re.fullmatch(DIGEST, evidence.get('backup_sha256', '')), 'backup-unverified')
        require(isinstance(evidence.get('reference'), str)
                and evidence['reference'].startswith('host-backup:') and len(evidence['reference']) <= 200,
                'backup-reference')
    receipt = {**{k: evidence[k] for k in (*fields, *extra)}, **bound}
    return {**receipt, 'evidence_sha256': digest(receipt)}


def backup_identity(evidence, config, live, config_hash):
    """Join independently observed live PG, exact info entry and repo-get artifact."""
    from contract import validate_backup_identity
    identity = config.get('backup_identity')
    validate_backup_identity(identity)
    require(isinstance(live, dict) and live.get('server_major') == 18
            and live.get('method') in ('pg_controldata', 'pg_control_system')
            and live.get('system_identifier') == identity['system_identifier'], 'backup-live-identity')
    fresh(live.get('observed_at'), config['evidence_max_age_seconds'])
    require(all(evidence.get(k) == v for k, v in identity.items())
            and re.fullmatch(DIGEST, config_hash or '')
            and evidence.get('config_sha256') == config_hash
            and type(evidence.get('database_id')) is int and evidence['database_id'] > 0
            and type(evidence.get('repo_key')) is int
            and evidence['repo_key'] == int(identity['repository']), 'backup-config-identity')
    manifest = evidence.get('manifest')
    require(isinstance(manifest, dict) and set(manifest) == {
        'path', 'sha256', 'bytes', 'label', 'started_at', 'stop', 'system_identifier',
        'server_major', 'database_id', 'backup_type', 'backrest_checksum', 'checksum_verified'},
        'backup-artifact')
    require(manifest['path'] == 'backup/{stanza}/{backup_id}/backup.manifest'.format(**evidence)
            and re.fullmatch(DIGEST, manifest.get('sha256', ''))
            and type(manifest['bytes']) is int and 0 < manifest['bytes'] <= 16 * 1024**2
            and re.fullmatch(r'[0-9a-f]{40}', manifest.get('backrest_checksum', ''))
            and manifest['checksum_verified'] is True
            and manifest['label'] == evidence['backup_id']
            and all(manifest.get(k) == evidence.get(k) for k in (
                'started_at', 'stop', 'system_identifier', 'server_major', 'database_id', 'backup_type')),
            'backup-artifact-binding')
    artifact = evidence.get('repo_get')
    require(isinstance(artifact, dict) and set(artifact) == {
        'wrapper', 'config_path', 'config_sha256', 'stanza', 'repository', 'repository_id',
        'path', 'sha256', 'bytes', 'status_code'}
        and type(artifact['status_code']) is int and artifact['status_code'] == 0
        and all(artifact.get(k) == evidence.get(k) for k in (
            'wrapper', 'config_path', 'config_sha256', 'stanza', 'repository', 'repository_id'))
        and all(artifact.get(k) == manifest.get(k) for k in ('path', 'sha256', 'bytes')),
        'backup-repo-get-binding')
    # Copy only the finite contract fields, never raw manifest/config/repository credentials.
    return {**{k: evidence[k] for k in ('config_path', 'config_sha256', 'repository_id',
            'system_identifier', 'database_id', 'repo_key', 'manifest', 'repo_get')},
            'live_identity': {k: live[k] for k in
                ('observed_at', 'method', 'system_identifier', 'server_major')}}
