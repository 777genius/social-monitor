"""Standalone fake command adapter: synthetic state only, no Docker/systemd/network."""
import hashlib
import json
import os
from pathlib import Path
import sys
import time

root = Path(sys.argv[1])
argv = sys.argv[2:]
state_path = root / 'fake.json'
state = json.loads(state_path.read_text())
with (root / 'commands.jsonl').open('a') as log:
    log.write(json.dumps(argv) + '\n')
command, args = Path(argv[0]).name, argv[1:]
result = None
if command == 'operator-adapter':
    binding = json.load(sys.stdin)
    verb = args[0]
    result = {'version': 1, 'observed_at': int(time.time()), **binding}
    if verb == 'release-evidence':
        result.update(event='push', branch='main', head_sha=binding['sha'],
                      main_sha=state.get('main_sha', binding['sha']), jobs=['success'],
                      legacy_workflow=state.get('legacy', 'disabled_manually'), api_only=True,
                      schema_changed=state.get('schema_changed', False),
                      worker_sensitive_changed=False, changed_paths=state.get('paths', ['apps/api/src/health.ts']),
                      production_revision=state.get('diff_base', state['previous_sha']),
                      diff_base=state.get('diff_base', state['previous_sha']), diff_head=binding['sha'],
                      complete_delta=state.get('complete_delta', True), delta_sha256='sha256:' + '8' * 64)
        from contract import digest
        result['compatibility'] = {'base': result['diff_base'], 'head': binding['sha'],
            'delta_sha256': result['delta_sha256'], 'paths_sha256': digest(result['changed_paths']),
            'independent_review': state.get('compatibility_reviewed', True),
            'all_shared_dependencies_reviewed': state.get('shared_reviewed', True),
            'compatible': True, 'evidence_sha256': 'sha256:' + '7' * 64}
    elif verb == 'backup':
        import hashlib
        encoded = json.dumps(binding, sort_keys=True, separators=(',', ':')).encode()
        now = int(time.time())
        stop = state.get('backup_stop', now)
        result.update(verified_at=state.get('backup_at', now), completed_at=stop, stop=stop,
                      format=state.get('backup_format', 'pgbackrest-full'), started_at=stop-11,
                      stanza='sandbox-main', repository='1', backup_id='20261002-052243F',
                      backup_type='full', server_major=18, pgbackrest_version='2.59.1',
                      status_code=state.get('backup_status', 0), error=state.get('backup_error', False),
                      wrapper='/usr/local/sbin/pgbackrest-with-cipher-pass',
                      reference='pgbackrest:sandbox-main:1:20261002-052243F',
                      receipt_digest='sha256:' + hashlib.sha256(encoded).hexdigest())
        identity = json.loads((root / 'config.json').read_text())['backup_identity']
        result.update(**identity, config_sha256='sha256:' + hashlib.sha256(
            Path(identity['config_path']).read_bytes()).hexdigest(), database_id=1, repo_key=1)
        result['manifest'] = {'path': 'backup/sandbox-main/20261002-052243F/backup.manifest',
            'sha256': 'sha256:' + hashlib.sha256(b'synthetic-manifest-bytes').hexdigest(),
            'bytes': len(b'synthetic-manifest-bytes'), 'label': result['backup_id'],
            **{k: result[k] for k in ('started_at', 'stop', 'system_identifier',
                                     'server_major', 'database_id', 'backup_type')},
            'backrest_checksum': '4' * 40, 'checksum_verified': True}
        result['repo_get'] = {**{k: result[k] for k in ('wrapper', 'config_path', 'config_sha256',
            'stanza', 'repository', 'repository_id')},
            **{k: result['manifest'][k] for k in ('path', 'sha256', 'bytes')}, 'status_code': 0}
        for key, value in state.get('backup_mutations', {}).items():
            result[key] = value if key not in ('manifest', 'repo_get') else {**result[key], **value}
    elif verb == 'postgres-identity':
        result.update(server_major=18, method='pg_controldata',
                      system_identifier=state.get('live_system_identifier', '1111111111111111111'))
    elif verb == 'database':
        from test_support import history_context
        from prisma_history import seal, summarize
        from uuid import UUID
        rows = [{'id': str(UUID(int=i+1)), 'applied_steps_count': 0,
                 'name': name, 'checksum': state.get('sql_checksum', hashlib.sha256(b'SELECT 1;').hexdigest()),
                 'started_at': '2026-10-01T00:00:00Z',
                 'finished_at': state.get('migration_finished', '2026-10-01T00:00:01Z'),
                 'rolled_back_at': state.get('migration_rolled_back')}
                for i, name in enumerate(state.get('migrations', ['20261001000000_initial']))]
        if state.get('resolved_retry') and rows:
            rows = [{**rows[0], 'id': str(UUID(int=10001)), 'finished_at': None,
                     'rolled_back_at': '2026-10-01T00:00:00.000001Z'},
                    {**rows[0], 'started_at': '2026-10-01T00:00:00.000002Z'}, *rows[1:]]
        identity = json.loads((root / 'config.json').read_text())['backup_identity']['system_identifier']
        context = history_context(rows, identity)
        context.update(state.get('database_context', {}))
        proof = seal(context, rows)
        applied, failed = summarize(proof)
        result['observed_at'] = int(time.time())
        result.update(server_major=18, read_only_role=state.get('read_only', True),
                      transaction_read_only=True, system_identifier=identity,
                      database=context['database'], observer_role=context['observer_role'], port=context['port'],
                      failed_migrations=failed, applied_migrations=applied, history=proof)
    elif verb == 'preflight':
        result.update(configured=True, legacy_workflow=state.get('legacy', 'disabled_manually'))
    elif verb == 'probe':
        result.update(ready=binding['image_id'] not in state.get('unready', []),
                      transport='docker-exec-http', http_status=200, status='ok', service='api-gateway',
                      postgres_pool_ok=True)
        if state.get('echo_probe'):
            result = {'version': 1, 'observed_at': int(time.time()), **binding, 'ready': True}
        if state.get('replace_probe_target'):
            state['target']['id'] = state.get('replacement_id', 'replacement')
            state['replacement_id'] = state['target']['id'] + '-again'
            state_path.write_text(json.dumps(state))
    if state.get('bad_binding'):
        result['image_id'] = 'sha256:' + 'f' * 64
elif command == 'systemctl':
    print('ActiveState=' + state.get('unit_active', 'inactive') + '\nSubState=dead\nUnitFileState=disabled\nExecMainStartTimestampMonotonic=' + state.get('unit_start', '0'))
    sys.exit(0)
elif command == 'docker':
    if args[:2] == ['compose', '--project-name']:
        if 'config' in args:
            result = state['model']
            if len([a for a in args if a == '-f']) > 1:
                index = len(args) - 1 - args[::-1].index('-f')
                override = json.loads(Path(args[index + 1]).read_text())
                result['services']['api']['image'] = override['services']['api']['image']
                if state.get('scope_mutation'):
                    result['services']['jev-agent-runtime']['image'] = result['services']['api']['image']
        elif 'up' in args:
            assert args[-7:] == ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api']
            index = len(args) - 1 - args[::-1].index('-f')
            image = json.loads(Path(args[index + 1]).read_text())['services']['api']['image']
            if state.get('crash_up'):
                state.pop('crash_up')
                state['target']['image'] = image
                state_path.write_text(json.dumps(state))
                os.kill(os.getppid(), 9)
                sys.exit(1)
            if image in state.get('up_fail', []):
                sys.exit(1)
            state['target']['image'] = image
            if state.get('drift_non_target'):
                state['containers']['jev-agent-runtime']['started'] = 'changed'
            state_path.write_text(json.dumps(state))
            sys.exit(0)
    elif args[:2] == ['ps', '-aq']:
        print(state.get('used_images', {}).get(args[-1][9:], '') if args[-1].startswith('ancestor=') else '\n'.join(['api', *state['containers']]))
        sys.exit(0)
    elif args[0] == 'inspect':
        result = state['target'] if args[-1] == 'api' else state['containers'][args[-1]]
    elif args[:2] == ['image', 'inspect']:
        image = args[-1]
        result = {'id': image, 'labels': {'org.opencontainers.image.revision':
                  state.get('wrong_revision', state['previous_sha'] if image == state['previous'] else state['sha']),
                  'social-monitor.ci-run-id': state['run']}, 'descriptor': state.get('descriptors', {}).get(image)}
    elif args[:2] == ['image', 'ls']:
        reference = args[args.index('--filter') + 1][10:]
        print(state.get('tags', {}).get(reference, ''))
        sys.exit(0)
    elif args[:2] in (['image', 'load'], ['image', 'tag'], ['image', 'rm']):
        if args[:2] == ['image', 'tag'] and state.get('fail_retention') \
                and state['target']['image'] != state['previous']:
            sys.exit(1)
        if args[:2] == ['image', 'tag']:
            state.setdefault('tags', {})[args[-1]] = args[-2]
        if args[:2] == ['image', 'rm']:
            state.setdefault('tags', {}).pop(args[-1], None)
        state_path.write_text(json.dumps(state))
        sys.exit(0)
if result is None:
    sys.exit(2)
print(json.dumps(result))
