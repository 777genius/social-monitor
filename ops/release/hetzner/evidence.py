"""Fail-closed policies for independently gathered release, SQL and backup evidence."""
import re
import time
from prisma_history import summarize, timestamp
from contract import DIGEST, digest, fresh, require


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
        if path.startswith('docs/'):
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


def database(evidence, migrations, system_identifier=None, max_age=300):
    require(type(evidence.get('server_major')) is int and evidence['server_major'] == 18
            and evidence.get('read_only_role') is True
            and evidence.get('transaction_read_only') is True, 'database-evidence')
    proof = evidence.get('history')
    applied, failed = summarize(proof)
    require(all(proof[k] == evidence.get(k) for k in
                ('system_identifier', 'database', 'observer_role', 'port'))
            and (system_identifier is None or proof['system_identifier'] == system_identifier),
            'history-binding')
    observed = timestamp(proof['observed_at']).timestamp()
    require(type(evidence.get('observed_at')) is int
            and 0 <= time.time() - observed <= max_age
            and 0 <= evidence['observed_at'] + 1 - observed <= max_age + 1, 'stale-evidence')
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
