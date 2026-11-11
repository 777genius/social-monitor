"""Three-target journal engine. Wire, ingress, lock and real frontend probe are caller-owned.

No production defaults or permissive readiness fallback. Backend-only receipts/state
remain independent. The shared controller must also fence unfinished cohort journals.
"""
import copy
from datetime import datetime
from pathlib import Path
import re
import time

from archive import inspect_archive
from backend_controller import BackendRelease
from backend_host import BackendHost
from cohort_host import CohortHost, TARGETS
import cohort_compose
from contract import DIGEST, KEY, Denied, atomic, canonical, digest, private_file_digest, read_json, require, trusted
import evidence as policies
from frontend_bundle import MAX_ARCHIVE, _validate_bundle
from frontend_host import MOUNTS, reject_shadow_mounts
from frontend_ingress import _authority
from frontend_tree import tree_digest, tree_digest_sources
from worker_host import SERVICE, WorkerHost

FRONTEND = 'frontend'


class _RuntimeHost(CohortHost):
    """Composition for the existing, shared marker-based worker drain implementation."""
    def __init__(self, host, root):
        super().__init__(host, root)
        self.worker = WorkerHost(host)


class _SealedWorker:
    def __init__(self, worker, guard):
        self.worker, self.guard = worker, guard

    def __getattr__(self, name):
        return getattr(self.worker, name)

    def restart(self, ident, policy):
        self.guard()
        return self.worker.restart(ident, policy)

    def term(self, ident):
        self.guard()
        return self.worker.term(ident)


class CohortRelease:
    capability = BackendRelease.capability

    def __init__(self, core, frontend_probe=None):
        self.core, self.root, self.frontend_probe = core, core.state / 'cohort', frontend_probe
        self.host = _RuntimeHost(core.host, self.root)

    def path(self, family, key):
        return self.root / family / (key + '.json')

    def initialize(self):
        for path in [self.root, *(self.root / name for name in
                ('admissions', 'transactions', 'receipts', 'overrides'))]:
            path.mkdir(mode=0o700, exist_ok=True)
            trusted(path, directory=True)

    def exclusive(self, key):
        require(isinstance(key, str) and re.fullmatch(KEY, key), 'cohort-key')
        self.core.exclusive('cohort-' + key)
        for namespace, code in ((self.core.state, 'unfinished-release'),
                (self.core.state / 'backend', 'unfinished-backend-release'),
                (self.root, 'unfinished-cohort-release')):
            for path in (namespace / 'transactions').glob('*.json'):
                require(path == self.path('transactions', key) or
                        read_json(path).get('outcome') in ('activated', 'rolled-back'), code)

    def available(self):
        require(callable(self.frontend_probe), 'cohort-frontend-probe-missing')
        require(not (self.core.state / 'latch.json').exists(), 'latched')

    @staticmethod
    def policy(value, service):
        if service != FRONTEND:
            return BackendHost.policy(value, service)
        value = copy.deepcopy(value)
        # Only sources of the three managed RO binds may vary. Options and every
        # other runtime field stay bound; actual sources/inodes are checked separately.
        mounts = value['Mounts']
        reject_shadow_mounts(mounts, 'Destination')
        selected = [m for m in mounts if m.get('Destination') in MOUNTS]
        for entry in value['HostConfig'].get('Mounts') or []:
            if entry.get('Target') in MOUNTS:
                entry['Source'] = '<managed-source>'
        binds = value['HostConfig'].get('Binds')
        if binds is not None:
            normalized = []
            for bind in binds:
                for mount in selected:
                    prefix = mount['Source'] + ':' + mount['Destination']
                    if bind == prefix or bind.startswith(prefix + ':'):
                        bind = '<managed-source>:' + mount['Destination'] + bind[len(prefix):]
                        break
                normalized.append(bind)
            value['HostConfig']['Binds'] = normalized
        for mount in selected:
            mount['Source'] = '<managed-source>'
        # These disjoint paths have no mount-order semantics. Keep unrelated slots
        # intact while canonicalizing only the managed entries across Docker outputs.
        for entries, field in ((value['Mounts'], 'Destination'),
                               (value['HostConfig'].get('Mounts') or [], 'Target')):
            positions = [i for i, entry in enumerate(entries) if entry.get(field) in MOUNTS]
            ordered = sorted((entries[i] for i in positions), key=lambda entry: entry[field])
            for index, entry in zip(positions, ordered): entries[index] = entry
        binds = value['HostConfig'].get('Binds') or []
        positions = [i for i, entry in enumerate(binds) if entry.startswith('<managed-source>:')]
        for index, entry in zip(positions, sorted(binds[i] for i in positions)): binds[index] = entry
        return BackendHost.policy(value, 'api')  # Frontend restart policy also remains bound.

    def roots(self, value, admission=None, unavailable_current=False):
        roots = self.core.host.c['compose_files']
        labels = value['Config'].get('Labels') or {}
        files = labels.get('com.docker.compose.project.config_files', '').split(',')
        require(files[:len(roots)] == roots and len(files) in (len(roots), len(roots) + 1),
                'cohort-runtime-roots-drift')
        if len(files) == len(roots):
            return None
        path = self.host._override_path(files[-1], existing=True)
        before, after = self.core.host.model(), self.core.host.model(path)
        document = read_json(path)
        images = {s: after['services'][s]['image'] for s in cohort_compose.BACKEND}
        sources = {v['target']: v['source'] for v in after['services'][FRONTEND]['volumes'] if v['target'] in MOUNTS}
        cohort_compose.check_scope(before, after, images, sources)
        if admission is not None:
            require(sources in (admission['desired_sources'], admission['previous_sources']),
                    'cohort-runtime-source-drift')
        if unavailable_current:
            require(admission is not None, 'cohort-runtime-admission-missing')
            # A damaged current candidate must not prevent restoration. Validate the
            # saved exact strings/options structurally; dereference only healthy desired
            # previous paths. No candidate verifier or payload is executed by this check.
            expected = cohort_compose.override(before, images, admission['previous_sources'])
            for mount in expected['services'][FRONTEND]['volumes']:
                mount['source'] = sources[mount['target']]
        else:
            expected = cohort_compose.override(before, images, sources)
        require(document == expected, 'cohort-runtime-override-drift')
        service = labels.get('com.docker.compose.service')
        if service in cohort_compose.BACKEND:
            require(images[service] == value['Image'], 'cohort-runtime-image-drift')
        return path

    def observe(self, admission=None, complete=False, check_runtime=True):
        snapshot, targets = self.host.snapshot(complete=complete)
        values = {s: self.host.inspect(t) for s, t in targets.items()}
        if admission:
            require(digest(snapshot) == admission['snapshot_sha256'], 'cohort-non-target-changed')
            require(self.core.host.compose_fingerprint() == admission['compose_hash'], 'trusted-compose-changed')
            for service, target in targets.items():
                allowed = ({admission['frontend_image_id']} if service == FRONTEND else
                           {admission['image_id'], admission['previous_image_ids'][service]})
                require(target['image'] in allowed, 'cohort-image-changed')
                self.roots(values[service], admission, unavailable_current=not check_runtime)
                if check_runtime:
                    require(self.policy(values[service], service) == admission['runtime_sha256'][service],
                            'cohort-runtime-changed:' + service)
        return snapshot, targets, values

    def evidence(self, item, revisions, snapshot):
        binding = {**self.core.binding(item), 'api_revision': revisions['api'],
                   'worker_revision': revisions[SERVICE], 'non_target_snapshot_sha256': snapshot}
        return policies.backend_compatibility(self.core.host.evidence('backend-release-evidence', binding),
                                               revisions, item['sha'], snapshot)

    def frontend_sources(self, target, value):
        return self.host.current_sources(target, self.roots(value))

    @staticmethod
    def releases(sources):
        result = {}
        for lane in ('public', 'admin'):
            marker = trusted(Path(sources['/usr/share/nginx/' + lane]) / 'release-sha.txt')
            require(marker.stat().st_size == 41, 'cohort-frontend-marker')
            content = marker.read_text()
            require(re.fullmatch(r'[0-9a-f]{40}\n', content), 'cohort-frontend-marker')
            result[lane] = content.strip()
        return result

    def front_ref(self, admission):
        reference = self.core.host.model()['services'][FRONTEND].get('image')
        require(isinstance(reference, str) and reference and not reference.startswith('-') and '$' not in reference,
                'cohort-frontend-image-ref')
        actual = self.core.host.docker('image', 'inspect', '--format', '{{.Id}}', reference).decode().strip()
        require(actual == admission['frontend_image_id'], 'cohort-frontend-image-ref-drift')

    def staged(self, item, proof, sources, verifier_hash, compatibility):
        require(isinstance(proof, dict) and set(proof) == {'root', 'authority', 'manifest_sha256',
                'archive_sha256', 'archive_bytes', 'tree_sha256'}, 'cohort-frontend-proof')
        authority = _authority(proof['authority'])
        require(authority['sha'] == item['sha'] and authority['ci_run_id'] == item['ci_run_id'] and
                authority['ci_run_attempt'] == str(compatibility['run_attempt']), 'cohort-frontend-binding')
        require(all(isinstance(proof[k], str) and re.fullmatch(DIGEST, proof[k])
                    for k in ('manifest_sha256', 'archive_sha256', 'tree_sha256')) and
                type(proof['archive_bytes']) is int and 0 < proof['archive_bytes'] <= MAX_ARCHIVE,
                'cohort-frontend-proof')
        require(isinstance(verifier_hash, str) and re.fullmatch(DIGEST, verifier_hash), 'cohort-verifier-proof')
        root = trusted(proof['root'], directory=True)
        require(set(sources) == set(MOUNTS), 'frontend-mount-targets')
        expected = {'/usr/share/nginx/' + lane: str(root / lane) for lane in ('public', 'admin')}
        require(all(sources[k] == v for k, v in expected.items()), 'cohort-frontend-sources')
        for target, (_, directory) in MOUNTS.items():
            trusted(sources[target], directory=directory)
        require(private_file_digest(sources['/run/bootstrap/verify-static-release.sh']) == verifier_hash,
                'cohort-verifier-proof')
        require(tree_digest(root) == proof['tree_sha256'], 'cohort-frontend-tree-proof')
        _validate_bundle(root, item['sha'])
        return {**proof, 'authority': authority, 'root': str(root)}

    def archive(self, admission):
        path = trusted(admission['backend_archive'])
        require(path.stat().st_size == admission['archive_bytes'], 'archive-size-changed')
        metadata = inspect_archive(path, admission['archive_sha256'], admission['image_id'],
            admission['sha'], admission['ci_run_id'], self.core.c['migration_root'])
        require(all(admission.get(k) == v for k, v in metadata.items()), 'cohort-archive-binding')
        return path

    def runtime_models(self, key, targets, values, sources):
        images = {s: targets[s]['image'] for s in cohort_compose.BACKEND}
        path = self.path('overrides', key + '-validation')
        atomic(path, cohort_compose.override(self.core.host.model(), images, sources))
        for service, value in values.items():
            line = self.core.host.command(self.core.host.compose(path) +
                ['--profile', '*', 'config', '--hash', service]).decode().strip().split()
            require(len(line) == 2 and line[0] == service and re.fullmatch(r'[0-9a-f]{64}', line[1]) and
                    value['Config']['Labels'].get('com.docker.compose.config-hash') == line[1],
                    'cohort-runtime-model-drift')

    def ready(self, targets, values, admission, rollback=False):
        images, revisions, sources, releases, verifier = self.desired(admission, rollback)
        if set(targets) != set(TARGETS) or not all(t['running'] for t in targets.values()):
            return False
        if any(targets[s]['image'] != images[s] for s in TARGETS):
            return False
        if not self.core.host.probe(images['api'], revisions['api']):
            return False
        worker = self.core.host.evidence('worker-probe', {'container_id': targets[SERVICE]['id'],
            'image_id': images[SERVICE], 'sha': revisions[SERVICE],
            'runtime_sha256': admission['runtime_sha256'][SERVICE],
            'restart_policy_sha256': digest(admission['restart_policy'])})
        if worker.get('ready') is not True or worker.get('service') != SERVICE:
            return False
        actual = self.frontend_sources(targets[FRONTEND], values[FRONTEND])
        if actual != {'sources': sources, 'verifier_sha256': verifier}:
            return False
        binding = {'container_id': targets[FRONTEND]['id'], 'image_id': images[FRONTEND],
                   'project': self.core.host.c['project'], 'public_sha': releases['public'],
                   'admin_sha': releases['admin'], 'verifier_sha256': verifier}
        try:
            proof = self.frontend_probe(dict(binding))
        except Denied:
            return False
        if isinstance(proof, dict) and proof.get('ready') is False:
            return False
        require(isinstance(proof, dict) and proof.get('ready') is True and proof.get('service') == FRONTEND and
                all(proof.get(k) == v for k, v in binding.items()) and proof.get('public_root_status') == 200 and
                proof.get('public_favicon_status') == 200 and proof.get('public_release_sha') == releases['public'] and
                proof.get('admin_root_status') == 401 and proof.get('mounted_admin_sha') == releases['admin'],
                'cohort-frontend-unready')
        after = self.host.inspect(targets[FRONTEND])
        before = values[FRONTEND]
        require(after.get('RestartCount') == before.get('RestartCount') and
                all(after.get('State', {}).get(k) == before.get('State', {}).get(k)
                    for k in ('Pid', 'StartedAt', 'Running')), 'cohort-frontend-race')
        require(self.frontend_sources(targets[FRONTEND], after) == actual, 'cohort-frontend-source-race')
        return True

    def admit(self, key, backend_item, frontend_proof, desired_sources, backend_archive, desired_verifier_sha256):
        self.available(); self.initialize(); self.exclusive(key)
        require(backend_item['sha'] + '-' + backend_item['ci_run_id'] == key, 'cohort-binding')
        snapshot, targets, values = self.observe(complete=True)
        for value in values.values(): self.roots(value)
        env = values[SERVICE].get('Config', {}).get('Env')
        require(isinstance(env, list) and all(isinstance(entry, str) for entry in env), 'cohort-worker-pause')
        for name, value in (('INTELLIGENCE_SUMMARY_EXECUTION_PAUSED', 'true'),
                            ('INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER', 'disabled'),
                            ('INTELLIGENCE_AUTO_SUMMARY_SCHEDULER', 'disabled'),
                            ('READER_VALUE_MODE', 'jev_primary_v3')):
            require([entry for entry in env if entry.startswith(name + '=')] == [name + '=' + value],
                    'cohort-worker-pause')
        previous = self.frontend_sources(targets[FRONTEND], values[FRONTEND])
        revisions = {s: self.core.previous_revision(targets[s]['image']) for s in cohort_compose.BACKEND}
        compatibility = self.evidence(backend_item, revisions, digest(snapshot))
        frontend = self.staged(backend_item, frontend_proof, desired_sources, desired_verifier_sha256, compatibility)
        admission = {**backend_item, 'backend_archive': str(trusted(backend_archive)),
            'frontend': frontend, 'desired_sources': dict(desired_sources),
            'desired_verifier_sha256': desired_verifier_sha256,
            'previous_sources': previous['sources'], 'previous_verifier_sha256': previous['verifier_sha256'],
            'previous_releases': self.releases(previous['sources']),
            'previous_frontend_tree_sha256': tree_digest_sources({lane: previous['sources'][
                '/usr/share/nginx/' + lane] for lane in ('public', 'admin')}),
            'frontend_image_id': targets[FRONTEND]['image'],
            'previous_image_ids': {s: t['image'] for s, t in targets.items()}, 'previous_revisions': revisions,
            'previous_container_ids': {s: t['id'] for s, t in targets.items()},
            'runtime_sha256': {s: self.policy(v, s) for s, v in values.items()},
            'restart_policy': values[SERVICE]['HostConfig']['RestartPolicy'],
            'snapshot_sha256': digest(snapshot), 'compose_hash': self.core.host.compose_fingerprint(),
            'compatibility': compatibility, 'database': self.core.database(backend_item),
            'backup': self.core.backup(backend_item)}
        admission['database_hash'] = digest(admission['database'])
        require(admission['restart_policy'] == self.host.worker.configured_restart(), 'worker-restart-config-drift')
        self.archive(admission); self.front_ref(admission)
        self.runtime_models(key, targets, values, previous['sources'])
        self.capability(targets[SERVICE])
        require(self.ready(targets, values, admission, rollback=True), 'cohort-previous-unready')
        path = self.path('admissions', key)
        if path.exists():
            existing = read_json(path)
            require(all(existing.get(k) == v for k, v in admission.items()
                        if k not in ('database', 'database_hash', 'backup')), 'cohort-admission-conflict')
            self.core.retained_database(existing, existing['database'])
            return existing
        atomic(path, admission, immutable=True)
        return admission

    def desired(self, admission, rollback):
        images = (admission['previous_image_ids'] if rollback else
                  {s: admission['frontend_image_id'] if s == FRONTEND else admission['image_id'] for s in TARGETS})
        revisions = (admission['previous_revisions'] if rollback else
                     {s: admission['sha'] for s in cohort_compose.BACKEND})
        return (images, revisions, admission['previous_sources'] if rollback else admission['desired_sources'],
            admission['previous_releases'] if rollback else {'public': admission['sha'], 'admin': admission['sha']},
            admission['previous_verifier_sha256'] if rollback else admission['desired_verifier_sha256'])

    def created(self, value, intent, admission=None, rollback=False):
        created = datetime.fromisoformat(value['Created'].replace('Z', '+00:00')).timestamp()
        require(created >= intent / 1_000_000_000, 'cohort-recreation-time')
        self.roots(value, admission, unavailable_current=rollback)

    def desired_frontend(self, value, sources):
        mounts = value.get('Mounts', [])
        reject_shadow_mounts(mounts, 'Destination')
        return all(len(found := [m for m in mounts if m.get('Destination') == target and
            m.get('Type') == 'bind' and m.get('RW') is False and m.get('Source') == source]) == 1
            for target, source in sources.items())

    def seal(self, admission, rollback=False):
        if rollback:
            actual = tree_digest_sources({lane: admission['previous_sources']['/usr/share/nginx/' + lane]
                                          for lane in ('public', 'admin')})
            expected = admission['previous_frontend_tree_sha256']
        else:
            actual = tree_digest(trusted(admission['frontend']['root'], directory=True))
            expected = admission['frontend']['tree_sha256']
        require(actual == expected, 'cohort-frontend-tree-changed')

    def drain(self, key, tx, admission, targets, values):
        worker = self.host.worker
        self.host.worker = _SealedWorker(worker, lambda: self.seal(admission, tx['direction'] == 'rollback'))
        try:
            return BackendRelease.drain(self, key, tx, admission, targets, values)
        finally:
            self.host.worker = worker

    def restore_worker_policy(self, tx, admission, target, value, desired_image):
        expected = admission['restart_policy']
        if value['HostConfig']['RestartPolicy'] == expected:
            return value
        proof = tx.get('drain_proof')
        require(isinstance(proof, dict) and proof.get('drained') is True and proof.get('service') == SERVICE and
                target['id'] == proof.get('container_id') and target['image'] == proof.get('image_id') == desired_image and
                value['HostConfig']['RestartPolicy'] == {'Name': 'no', 'MaximumRetryCount': 0} and
                str(value['RestartCount']) == proof.get('restart_count') and
                self.policy(value, SERVICE) == admission['runtime_sha256'][SERVICE], 'cohort-restart-restore-proof')
        if value['State']['Running']:
            intent = tx.get('up_intents', {}).get(SERVICE)
            require(type(intent) is int and
                    datetime.fromisoformat(value['State']['StartedAt'].replace('Z', '+00:00')).timestamp() >=
                    intent / 1_000_000_000, 'cohort-restart-restore-start')
        else:
            require(digest(value['State']['StartedAt']) == proof.get('started_at_sha256'),
                    'cohort-restart-restore-start')
        # Proven drain + captured admission policy are already durable. Docker update
        # is idempotent and does not start/restart this exact process; replay re-observes it.
        self.seal(admission, tx['direction'] == 'rollback')
        self.host.worker.restart(target['id'], expected)
        after = self.host.inspect(target)
        require(after['HostConfig']['RestartPolicy'] == expected and
                self.policy(after, SERVICE) == admission['runtime_sha256'][SERVICE], 'cohort-restart-restore-drift')
        return after

    def converge(self, key, tx, admission, targets, values):
        rollback = tx['direction'] == 'rollback'
        images, _, sources, _, verifier = self.desired(admission, rollback)
        for target, (_, directory) in MOUNTS.items(): trusted(sources[target], directory=directory)
        require(private_file_digest(sources['/run/bootstrap/verify-static-release.sh']) == verifier,
                'cohort-verifier-proof')
        self.front_ref(admission)
        order = (FRONTEND, 'api', SERVICE) if rollback else TARGETS
        path = self.path('transactions', key)
        for service in order:
            target, old = targets.get(service), tx['origin_ids'].get(service)
            expected = tx.get('created_ids', {}).get(service)
            if service == SERVICE and target is not None and target['image'] == images[SERVICE]:
                values[SERVICE] = self.restore_worker_policy(tx, admission, target, values[SERVICE], images[SERVICE])
            if target is not None and target['id'] != old:
                if expected is None:
                    require(service in tx.get('up_intents', {}) and target['image'] == images[service],
                            'cohort-recreation-drift')
                    self.created(values[service], tx['up_intents'][service], admission, rollback)
                    tx.setdefault('created_ids', {})[service] = target['id']; atomic(path, tx)
                else:
                    require(target['id'] == expected, 'cohort-created-container-changed')
                if not target['running'] and values[service]['State'].get('Status') == 'created':
                    state = values[service]
                    require(state['State']['StartedAt'].startswith('0001-01-01T00:00:00') and
                            state['RestartCount'] == 0, 'cohort-created-start-state')
                    self.seal(admission, rollback)
                    self.core.host.docker('start', target['id'])
                    _, targets, values = self.observe(admission, check_runtime=not rollback)
                continue
            matches = (service != FRONTEND or self.desired_frontend(values[service], sources)) if target else False
            if target is not None and target['running'] and target['image'] == images[service] and matches:
                continue
            require(expected is None and (target is not None or service in tx.get('up_intents', {})),
                    'cohort-container-disappeared')
            tx.setdefault('up_intents', {}).setdefault(service, time.time_ns()); atomic(path, tx)
            if service == FRONTEND: self.front_ref(admission)
            self.seal(admission, rollback)
            self.host.up({s: images[s] for s in cohort_compose.BACKEND}, sources,
                self.path('overrides', key + ('-rollback' if rollback else '')), admission['compose_hash'], service)
            _, targets, values = self.observe(admission, check_runtime=not rollback)
            require(service in targets and targets[service]['image'] == images[service], 'cohort-up-unobserved')
            tx.setdefault('created_ids', {})[service] = targets[service]['id']; atomic(path, tx)
        return targets, values

    def receipt(self, key, rollback=False):
        require(isinstance(key, str) and re.fullmatch(KEY, key), 'cohort-key')
        return read_json(self.path('receipts', key + ('-rollback' if rollback else '')))

    def finish(self, key, tx, admission, targets):
        rollback = tx['direction'] == 'rollback'
        self.seal(admission, rollback)
        name = key + ('-rollback' if rollback else '')
        path = self.path('receipts', name)
        if 'finished_at_ns' not in tx:
            require(not path.exists() and tx.get('outcome') is None, 'cohort-receipt-conflict')
            # Pin before publication: either crash window reuses the same finish time.
            tx['finished_at_ns'] = time.time_ns()
            atomic(self.path('transactions', key), tx)
        require(type(tx['finished_at_ns']) is int and type(tx['started_at_ns']) is int and
                tx['finished_at_ns'] >= tx['started_at_ns'] > 0, 'cohort-receipt-conflict')
        images, _, sources, releases, verifier = self.desired(admission, rollback)
        receipt = {'schema': 'social-monitor-cohort-release-receipt-v1', **self.core.binding(admission),
            'scope': list(TARGETS), 'frontend': admission['frontend'], 'active_image_ids': images,
            'previous_image_ids': admission['previous_image_ids'], 'previous_revisions': admission['previous_revisions'],
            'target_container_ids': {s: t['id'] for s, t in targets.items()}, 'active_sources': sources,
            'previous_sources': admission['previous_sources'], 'active_releases': releases,
            'active_frontend_tree_sha256': admission['previous_frontend_tree_sha256'] if rollback else
                admission['frontend']['tree_sha256'],
            'verifier_sha256': verifier, 'runtime_sha256': admission['runtime_sha256'],
            'snapshot_sha256': admission['snapshot_sha256'], 'compose_hash': admission['compose_hash'],
            'compatibility': admission['compatibility'], 'database': tx['database'], 'backup': tx['backup'],
            'outcome': 'rolled-back' if rollback else 'activated',
            'timings': {'started_at_ns': tx['started_at_ns'], 'finished_at_ns': tx['finished_at_ns']}}
        if path.exists():
            require(canonical(read_json(path)) == canonical(receipt), 'cohort-receipt-conflict')
        else:
            atomic(path, receipt, immutable=True)
        tx['outcome'] = receipt['outcome']; atomic(self.path('transactions', key), tx)
        return receipt

    def activate(self, key, rollback=False):
        self.available(); self.exclusive(key)
        admission = read_json(self.path('admissions', key))
        require(admission['sha'] + '-' + admission['ci_run_id'] == key, 'cohort-binding')
        path = self.path('transactions', key)
        tx = read_json(path) if path.exists() else None
        require(tx is None or isinstance(tx, dict) and tx.get('admission') == admission, 'cohort-transaction-binding')
        if tx is not None:
            require(tx.get('direction') in ('activate', 'rollback') and
                    tx.get('phase') in ('restart-policy', 'signal', 'draining', 'starting') and
                    tx.get('outcome') in (None, 'activated', 'rolled-back'), 'cohort-transaction-state')
            if tx['phase'] == 'starting':
                require(isinstance(tx.get('drain_proof'), dict) and
                        tx['drain_proof'].get('drained') is True and
                        tx['drain_proof'].get('service') == SERVICE, 'cohort-drain-proof-missing')
        require(not rollback or tx is not None, 'cohort-rollback-unstarted')
        _, targets, values = self.observe(admission, complete=tx is None, check_runtime=not rollback)
        previous_tx = tx
        direction = 'rollback' if rollback else 'activate'
        if tx is not None:
            images, _, _, _, _ = self.desired(admission, tx['direction'] == 'rollback')
            for service, target in targets.items():
                if target['id'] not in (tx['origin_ids'].get(service), tx.get('created_ids', {}).get(service)):
                    require(service in tx.get('up_intents', {}) and target['image'] == images[service],
                            'cohort-recreation-drift')
                    self.created(values[service], tx['up_intents'][service], admission, rollback)
        if tx is not None and tx['direction'] != direction:
            require(rollback, 'cohort-direction-conflict')
            if tx['phase'] in ('restart-policy', 'signal', 'draining') and tx.get('outcome') is None:
                tx['direction'] = direction; atomic(path, tx)
            else:
                tx = None
        if tx is None:
            require(set(targets) == set(TARGETS) or rollback, 'cohort-target-count')
            recovered = False
            if rollback and previous_tx.get('drain_proof') is not None:
                worker = values.get(SERVICE)
                if worker is None:
                    recovered = True
                elif not worker['State']['Running'] and targets[SERVICE]['id'] == previous_tx['drain']['container_id']:
                    proof = previous_tx['drain_proof']
                    require(proof.get('container_id') == targets[SERVICE]['id'] and
                            proof.get('image_id') == targets[SERVICE]['image'] and
                            digest(worker['State']['StartedAt']) == proof.get('started_at_sha256') and
                            str(worker['RestartCount']) == proof.get('restart_count'), 'cohort-drain-process-changed')
                    recovered = True
                elif (worker['State'].get('Status') == 'created' and not worker['State']['Running'] and
                        worker['State']['StartedAt'].startswith('0001-01-01T00:00:00') and worker['RestartCount'] == 0):
                    require(SERVICE in previous_tx.get('up_intents', {}) and
                            worker['Image'] == admission['image_id'] and
                            self.policy(worker, SERVICE) == admission['runtime_sha256'][SERVICE],
                            'cohort-never-started-worker')
                    self.created(worker, previous_tx['up_intents'][SERVICE], admission, rollback=True); recovered = True
            if not rollback:
                require(all(targets[s]['id'] == admission['previous_container_ids'][s] for s in TARGETS),
                        'cohort-target-drift')
                require(self.evidence(admission, admission['previous_revisions'], admission['snapshot_sha256']) ==
                        admission['compatibility'], 'cohort-compatibility-changed')
                self.staged(admission, admission['frontend'], admission['desired_sources'],
                            admission['desired_verifier_sha256'], admission['compatibility'])
                previous = self.frontend_sources(targets[FRONTEND], values[FRONTEND])
                require(previous == {'sources': admission['previous_sources'],
                    'verifier_sha256': admission['previous_verifier_sha256']} and
                    self.releases(previous['sources']) == admission['previous_releases'],
                    'cohort-previous-frontend-drift')
            self.front_ref(admission)
            archive = self.archive(admission)
            database, backup = self.core.database(admission), self.core.backup(admission)
            self.core.retained_database(admission, database)
            if not rollback:
                self.seal(admission)
                self.core.host.import_image(archive, admission)
            self.seal(admission, rollback)
            self.core.host.retain([admission['image_id'], *admission['previous_image_ids'].values()])
            tx = {'admission': admission, 'direction': direction, 'phase': 'starting' if recovered else 'restart-policy',
                'origin_ids': {s: t['id'] for s, t in targets.items()}, 'database': database, 'backup': backup,
                'started_at_ns': time.time_ns(), 'outcome': None}
            if recovered:
                tx['drain_proof'] = previous_tx['drain_proof']
                tx['up_intents'] = {s: time.time_ns() for s in TARGETS if s not in targets}
            atomic(path, tx)
        self.core.retained_database(admission, tx['database'])
        if tx.get('outcome') is not None or self.path('receipts', key + ('-rollback' if rollback else '')).exists():
            require(self.ready(targets, values, admission, rollback), 'cohort-receipt-not-current')
            return self.finish(key, tx, admission, targets)
        if tx['phase'] in ('restart-policy', 'signal', 'draining'):
            require(SERVICE in targets, 'cohort-worker-missing')
            if not self.drain(key, tx, admission, targets, values):
                return {'phase': 'draining', **self.core.binding(admission), 'scope': list(TARGETS)}
            _, targets, values = self.observe(admission, check_runtime=not rollback)
        targets, values = self.converge(key, tx, admission, targets, values)
        self.observe(admission, complete=True)  # Exact restored runtime before any terminal receipt.
        if self.ready(targets, values, admission, rollback):
            tx['database'] = self.core.database(admission); self.core.retained_database(admission, tx['database'])
            atomic(path, tx)
            return self.finish(key, tx, admission, targets)
        return {'phase': 'starting', **self.core.binding(admission), 'scope': list(TARGETS)}

    def rollback(self, key):
        return self.activate(key, rollback=True)

    def verify(self, key):
        require(isinstance(key, str) and re.fullmatch(KEY, key), 'cohort-key')
        self.available()
        admission = read_json(self.path('admissions', key))
        _, targets, values = self.observe(admission, complete=True)
        require(self.ready(targets, values, admission), 'cohort-unready')
        self.seal(admission)
        return {'verified': True, 'scope': list(TARGETS), **self.core.binding(admission)}
