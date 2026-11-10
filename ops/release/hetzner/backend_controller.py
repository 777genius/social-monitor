"""Fixed two-target release journal, under the original controller's exclusive lock."""
import os
from pathlib import Path
import shutil
import tempfile
import time
from archive import inspect_archive
from bounds import receive_bytes
from contract import atomic, digest, read_json, require, sync_dir, trusted
from backend_host import BackendHost, TARGETS
from worker_host import SERVICE
import evidence as policies


class BackendRelease:
    def __init__(self, core):
        self.core, self.root = core, core.state / 'backend'
        self.host = BackendHost(core.host, self.root)

    def path(self, family, key):
        return self.root / family / (key + ('.tar' if family == 'inbox' else '.json'))

    def initialize(self):
        for path in [self.root, *(self.root / name for name in
                ('inbox', 'imports', 'admissions', 'transactions', 'receipts', 'overrides'))]:
            path.mkdir(mode=0o700, exist_ok=True)
            trusted(path, directory=True)

    def observe(self, admission=None, complete=True, check_runtime=True):
        snapshot, targets = self.host.snapshot(complete)
        values = {s: self.host.inspect(t) for s, t in targets.items()}
        if admission:
            require(digest(snapshot) == admission['snapshot_sha256'], 'backend-non-target-changed')
            require(self.core.host.compose_fingerprint() == admission['compose_hash'], 'trusted-compose-changed')
            for service, target in targets.items():
                require(target['image'] in (admission['image_id'], admission['previous_image_ids'][service]),
                        'backend-image-changed')
                if check_runtime:
                    require(self.host.policy(values[service], service) == admission['runtime_sha256'][service],
                            'backend-runtime-changed')
        return snapshot, targets, values

    def evidence(self, item, revisions, snapshot):
        binding = {**self.core.binding(item), 'api_revision': revisions['api'],
                   'worker_revision': revisions[SERVICE], 'non_target_snapshot_sha256': snapshot}
        return policies.backend_compatibility(self.core.host.evidence('backend-release-evidence', binding),
                                               revisions, item['sha'], snapshot)

    def readiness(self, targets, admission, images, revisions):
        return set(targets) == set(TARGETS) and all(self.host.ready(targets[s], admission, images[s], revisions[s])
                                                    for s in TARGETS)

    def capability(self, target):
        proof = self.core.host.evidence('worker-capability', {'container_id': target['id'],
                                                              'image_id': target['image']})
        require(proof.get('supported') is True and proof.get('service') == SERVICE and
                proof.get('signal_replay') == 'nest-guarded-v1',
                'worker-drain-capability-missing')

    def preflight(self):
        snapshot, targets, values = self.observe()
        self.host.roots_match(values)
        require(all(t['running'] for t in targets.values()) and
                self.host.worker.signal_ready(values[SERVICE]), 'backend-unready')
        self.capability(targets[SERVICE])
        result = self.core.host.evidence('preflight', {})
        require(result.get('configured') is True and result.get('legacy_workflow') == 'disabled_manually',
                'preflight-unconfigured')
        return {'environment': 'production-hetzner', 'machine_id': self.core.identity(),
                'active_image_ids': {s: t['image'] for s, t in targets.items()},
                'snapshot': digest(snapshot), 'compose': self.core.host.compose_fingerprint(),
                'latch': (self.core.state / 'latch.json').exists()}

    def receive(self, args, stream):
        sha, run, checksum, image, count = args
        size, key = int(count), sha + '-' + run
        require(size <= self.core.c['max_archive_bytes'], 'archive-size-limit')
        require(shutil.disk_usage(self.root).free >= size * 2 + 2 * 1024**3, 'disk-space')
        fd, name = tempfile.mkstemp(prefix='.upload-', dir=self.root / 'inbox')
        try:
            with os.fdopen(fd, 'wb') as output:
                receive_bytes(stream, output, size)
                output.flush(); os.fsync(output.fileno())
            metadata = inspect_archive(Path(name), checksum, image, sha, run, self.core.c['migration_root'])
            item = {'sha': sha, 'ci_run_id': run, 'archive_sha256': checksum,
                    'image_id': image, 'archive_bytes': size, **metadata}
            snapshot, targets, values = self.observe()
            self.host.roots_match(values)
            revisions = {s: self.core.previous_revision(t['image']) for s, t in targets.items()}
            self.evidence(item, revisions, digest(snapshot))
            destination = self.path('inbox', key)
            if destination.exists():
                require(destination.stat().st_size == size, 'archive-conflict')
                inspect_archive(destination, checksum, image, sha, run, self.core.c['migration_root'])
            else:
                os.link(name, destination); sync_dir(destination.parent)
            atomic(self.path('imports', key), item, immutable=True)
            return item
        finally:
            os.unlink(name)

    def admit(self, key):
        item = read_json(self.path('imports', key))
        snapshot, targets, values = self.observe()
        self.host.roots_match(values)
        self.host.assert_runtime_model(values, key)
        require(all(t['running'] for t in targets.values()), 'backend-unready')
        self.capability(targets[SERVICE])
        previous = {s: t['image'] for s, t in targets.items()}
        revisions = {s: self.core.previous_revision(image) for s, image in previous.items()}
        restart = values[SERVICE]['HostConfig']['RestartPolicy']
        require(restart == self.host.worker.configured_restart(), 'worker-restart-config-drift')
        admission = {**item, 'previous_image_ids': previous, 'previous_revisions': revisions,
            'previous_container_ids': {s: t['id'] for s, t in targets.items()},
            'snapshot_sha256': digest(snapshot),
            'runtime_sha256': {s: self.host.policy(v, s) for s, v in values.items()}, 'restart_policy': restart,
            'compose_hash': self.core.host.compose_fingerprint(),
            'compatibility': self.evidence(item, revisions, digest(snapshot)),
            'database': self.core.database(item), 'backup': self.core.backup(item)}
        admission['database_hash'] = digest(admission['database'])
        require(self.readiness(targets, admission, previous, revisions), 'backend-unready')
        path = self.path('admissions', key)
        if path.exists():
            existing = read_json(path)
            require(all(existing.get(k) == v for k, v in admission.items()
                        if k not in ('database', 'database_hash', 'backup')), 'backend-admission-conflict')
            self.core.retained_database(existing, existing['database'])
            return existing
        atomic(path, admission, immutable=True)
        return admission

    def exclusive(self, key):
        self.core.exclusive('backend-' + key)
        for path in (self.root / 'transactions').glob('*.json'):
            require(path == self.path('transactions', key) or read_json(path).get('outcome') is not None,
                    'unfinished-backend-release')

    def desired(self, admission, rollback):
        return ((admission['previous_image_ids'], admission['previous_revisions']) if rollback else
                ({s: admission['image_id'] for s in TARGETS}, {s: admission['sha'] for s in TARGETS}))

    def finish(self, key, tx, admission, targets):
        receipt_key = key + ('-rollback' if tx['direction'] == 'rollback' else '')
        path = self.path('receipts', receipt_key)
        if path.exists():
            # Publication is authoritative if the process died before the tx outcome write.
            receipt = read_json(path)
            require(receipt['schema'] == 'social-monitor-backend-release-receipt-v1' and
                    all(receipt.get(k) == v for k, v in self.core.binding(admission).items()) and
                    receipt['target_container_ids'] == {s: t['id'] for s, t in targets.items()} and
                    receipt['outcome'] == ('rolled-back' if tx['direction'] == 'rollback' else 'activated') and
                    receipt['timings']['started_at_ns'] == tx['started_at_ns'], 'backend-receipt-conflict')
        else:
            receipt = {'schema': 'social-monitor-backend-release-receipt-v1', **self.core.binding(admission),
                'scope': list(TARGETS), 'previous_image_ids': admission['previous_image_ids'],
                'previous_revisions': admission['previous_revisions'],
                'active_image_ids': {s: t['image'] for s, t in targets.items()},
                'target_container_ids': {s: t['id'] for s, t in targets.items()},
                'runtime_sha256': admission['runtime_sha256'], 'snapshot_sha256': admission['snapshot_sha256'],
                'compose_hash': admission['compose_hash'], 'compatibility': admission['compatibility'],
                'database': tx['database'], 'backup': tx['backup'],
                'outcome': 'rolled-back' if tx['direction'] == 'rollback' else 'activated',
                'timings': {'started_at_ns': tx['started_at_ns'], 'finished_at_ns': time.time_ns()}}
            atomic(path, receipt, immutable=True)
        tx['outcome'] = receipt['outcome']
        atomic(self.path('transactions', key), tx)
        return receipt

    def drain(self, key, tx, admission, targets, values):
        target, value = targets[SERVICE], values[SERVICE]
        replay_signal = tx['phase'] == 'draining'
        check_runtime = tx['direction'] != 'rollback'
        path = self.path('transactions', key)
        if 'drain' not in tx:
            require(value['State']['Running'] and self.host.worker.signal_ready(value), 'worker-drain-bootstrap')
            self.capability(target)
            tx['drain'] = {'container_id': target['id'], 'image_id': target['image'],
                'started_at_sha256': digest(value['State']['StartedAt']),
                'restart_count': str(value['RestartCount'])}
            tx['phase'] = 'restart-policy'; atomic(path, tx)
        proof = tx['drain']
        require(target['id'] == proof['container_id'] and target['image'] == proof['image_id'] and
                digest(value['State']['StartedAt']) == proof['started_at_sha256'] and
                str(value['RestartCount']) == proof['restart_count'], 'worker-drain-container-changed')
        if tx['phase'] == 'restart-policy':
            self.host.worker.restart(target['id'], {'Name': 'no', 'MaximumRetryCount': 0})
            tx['phase'] = 'signal'; atomic(path, tx)
        if tx['phase'] == 'signal':
            _, current_targets, current_values = self.observe(admission, check_runtime=check_runtime)
            current = current_values[SERVICE]
            require(current_targets[SERVICE]['id'] == proof['container_id'] and current['State']['Running'] and
                    digest(current['State']['StartedAt']) == proof['started_at_sha256'] and
                    str(current['RestartCount']) == proof['restart_count'] and
                    current['HostConfig']['RestartPolicy'] == {'Name': 'no', 'MaximumRetryCount': 0} and
                    self.host.worker.signal_ready(current), 'worker-drain-pre-signal')
            # Publish before effect. Recovery may replay only the exact process with
            # the attested Nest duplicate-signal guard; completion still needs its marker.
            proof['signal_since_ms'] = str(time.time_ns() // 1_000_000)
            tx['signal_attempts'] = 1
            tx['phase'] = 'draining'; atomic(path, tx)
            self.host.worker.term(target['id'])
        _, targets, values = self.observe(admission, check_runtime=check_runtime)
        current = values[SERVICE]
        require(targets[SERVICE]['id'] == proof['container_id'] and
                digest(current['State']['StartedAt']) == proof['started_at_sha256'] and
                str(current['RestartCount']) == proof['restart_count'] and
                current['HostConfig']['RestartPolicy'] == {'Name': 'no', 'MaximumRetryCount': 0},
                'worker-drain-container-changed')
        if current['State']['Running']:
            if replay_signal and self.host.worker.signal_ready(current):
                self.capability(targets[SERVICE])
                tx['signal_attempts'] += 1
                atomic(path, tx)
                self.host.worker.term(proof['container_id'])
            return False
        result = self.core.host.evidence('worker-drain', proof)
        require(result.get('drained') is True and result.get('service') == SERVICE, 'worker-drain-unproved')
        tx['drain_proof'] = result
        tx['database'] = self.core.database(admission)
        self.core.retained_database(admission, tx['database'])
        tx['backup'] = self.core.backup(admission)
        tx['phase'] = 'starting'; atomic(path, tx)
        return True

    def converge(self, key, tx, admission, targets, values):
        images, revisions = self.desired(admission, tx['direction'] == 'rollback')
        for service in TARGETS:
            target = targets.get(service)
            old_id = tx['origin_ids'].get(service)
            expected = tx.get('created_ids', {}).get(service)
            if target is not None and target['id'] != old_id:
                if expected is None:
                    intent = tx.get('up_intents', {}).get(service)
                    require(intent is not None and target['image'] == images[service], 'backend-recreation-drift')
                    self.host.created_after(values[service], intent)
                    tx.setdefault('created_ids', {})[service] = target['id']
                    atomic(self.path('transactions', key), tx)
                else:
                    require(target['id'] == expected, 'backend-created-container-changed')
                if not target['running'] and values[service]['State'].get('Status') == 'created':
                    tx.setdefault('start_intents', {})[service] = target['id']
                    atomic(self.path('transactions', key), tx)
                    self.host.start_created(target, values[service])
                    _, targets, values = self.observe(admission, complete=False,
                                                      check_runtime=tx['direction'] != 'rollback')
                continue  # Observe startup; never recreate a known new container again.
            if target is not None and target['image'] == images[service] and target['running']:
                continue
            require(expected is None, 'backend-created-container-missing')
            require(target is not None or service in tx.get('up_intents', {}), 'backend-container-disappeared')
            if service not in tx.get('up_intents', {}):
                tx.setdefault('up_intents', {})[service] = time.time_ns()
                atomic(self.path('transactions', key), tx)
            self.host.up(images, self.path('overrides', key), admission['compose_hash'], service)
            _, targets, values = self.observe(admission, complete=False, check_runtime=tx['direction'] != 'rollback')
            require(service in targets and targets[service]['image'] == images[service], 'backend-up-unobserved')
            tx.setdefault('created_ids', {})[service] = targets[service]['id']
            atomic(self.path('transactions', key), tx)
        return targets, revisions, images

    def activate(self, key, rollback=False):
        self.exclusive(key)
        admission = read_json(self.path('admissions', key))
        require(admission['sha'] + '-' + admission['ci_run_id'] == key, 'admission-binding')
        path = self.path('transactions', key)
        tx = read_json(path) if path.exists() else None
        require(tx is None or tx['admission'] == admission, 'backend-transaction-binding')
        require(not rollback or tx is not None, 'backend-rollback-unstarted')
        _, targets, values = self.observe(admission, complete=tx is None or tx.get('phase') != 'starting',
                                                 check_runtime=not rollback)
        if rollback and tx is not None:
            recovery_images, _ = self.desired(admission, tx['direction'] == 'rollback')
            for service, target in targets.items():
                if target['id'] not in (tx.get('origin_ids', {}).get(service), tx.get('created_ids', {}).get(service)):
                    intent = tx.get('up_intents', {}).get(service)
                    require(intent is not None and target['image'] == recovery_images[service],
                            'backend-rollback-target-drift')
                    self.host.created_after(values[service], intent)
            allowed_ids = {**tx.get('origin_ids', {}), **tx.get('created_ids', {})}
            require(all(t['id'] in (tx.get('origin_ids', {}).get(s), allowed_ids.get(s)) or
                        (tx.get('up_intents', {}).get(s) is not None and t['image'] == recovery_images[s])
                        for s, t in targets.items()), 'backend-rollback-target-drift')
        previous_tx = tx
        direction = 'rollback' if rollback else 'activate'
        if tx is not None and tx['direction'] != direction:
            require(rollback, 'backend-direction-conflict')
            if tx['phase'] in ('restart-policy', 'signal', 'draining') and tx.get('outcome') is None:
                tx['direction'] = direction; atomic(path, tx)
            else:
                tx = None
        if tx is None:
            self.host.roots_match(values)
            self.host.assert_runtime_model(values, key)
            images, _ = self.desired(admission, not rollback)
            never_started = False
            if rollback and previous_tx is not None and SERVICE in targets:
                worker = values[SERVICE]
                intent = previous_tx.get('up_intents', {}).get(SERVICE)
                never_started = (intent is not None and targets[SERVICE]['image'] == admission['image_id'] and
                    worker['State'].get('Status') == 'created' and not worker['State']['Running'] and
                    worker['State']['StartedAt'].startswith('0001-01-01T00:00:00') and
                    worker['RestartCount'] == 0 and
                    self.host.policy(worker, SERVICE) == admission['runtime_sha256'][SERVICE])
                if never_started:
                    self.host.created_after(worker, intent)
            recovering_drain = (rollback and previous_tx is not None and
                previous_tx.get('drain_proof') is not None and
                (SERVICE not in targets or not targets[SERVICE]['running']) and
                (SERVICE not in targets or targets[SERVICE]['id'] == previous_tx['drain']['container_id'] or
                 never_started))
            require((set(targets) == set(TARGETS) or recovering_drain) and (rollback or
                    all(targets[s]['image'] == images[s] for s in TARGETS)), 'backend-target-drift')
            if not rollback:
                require(self.evidence(admission, admission['previous_revisions'], admission['snapshot_sha256']) ==
                        admission['compatibility'], 'backend-compatibility-changed')
            database, backup = self.core.database(admission), self.core.backup(admission)
            self.core.retained_database(admission, database)
            archive = self.path('inbox', key)
            inspect_archive(archive, admission['archive_sha256'], admission['image_id'], admission['sha'],
                            admission['ci_run_id'], self.core.c['migration_root'])
            if not rollback:
                self.core.host.import_image(archive, admission)
            self.core.host.retain([admission['image_id'], *admission['previous_image_ids'].values()])
            tx = {'admission': admission, 'direction': direction, 'phase': 'restart-policy',
                  'origin_ids': {s: t['id'] for s, t in targets.items()}, 'database': database,
                  'backup': backup, 'started_at_ns': time.time_ns(), 'outcome': None}
            if recovering_drain:
                tx['phase'] = 'starting'
                tx['drain_proof'] = previous_tx['drain_proof']
                tx['up_intents'] = {s: time.time_ns() for s in TARGETS if s not in targets}
            atomic(path, tx)
        self.core.retained_database(admission, tx['database'])
        images, revisions = self.desired(admission, rollback)
        receipt = self.path('receipts', key + ('-rollback' if rollback else ''))
        if tx.get('outcome') is not None or receipt.exists():
            require(self.readiness(targets, admission, images, revisions), 'backend-receipt-not-current')
            return self.finish(key, tx, admission, targets)
        if tx['phase'] in ('restart-policy', 'signal', 'draining'):
            if not self.drain(key, tx, admission, targets, values):
                return {'phase': 'draining', **self.core.binding(admission), 'scope': list(TARGETS)}
            _, targets, values = self.observe(admission, complete=False, check_runtime=not rollback)
        if tx['phase'] == 'starting':
            # This is recovery of the already authorized durable transaction. Do not
            # spend public GitHub quota on every startup poll; authority loss is handled
            # by the client's bound rollback, never by admitting a new stale candidate.
            targets, revisions, images = self.converge(key, tx, admission, targets, values)
        self.observe(admission)  # Restored runtime must match before any successful receipt.
        if self.readiness(targets, admission, images, revisions):
            tx['database'] = self.core.database(admission)
            self.core.retained_database(admission, tx['database'])
            atomic(path, tx)
            return self.finish(key, tx, admission, targets)
        return {'phase': 'starting', **self.core.binding(admission), 'scope': list(TARGETS)}

    def dispatch(self, verb, args, stream):
        if verb == 'preflight':
            return self.preflight()
        require(not (self.core.state / 'latch.json').exists(), 'latched')
        self.initialize()
        if verb == 'receive':
            return self.receive(args, stream)
        key = '-'.join(args)
        if verb == 'receipt':
            return read_json(self.path('receipts', args[0]))
        if verb == 'admit':
            return self.admit(key)
        if verb == 'verify':
            admission = read_json(self.path('admissions', key))
            _, targets, _ = self.observe(admission)
            images, revisions = self.desired(admission, False)
            require(self.readiness(targets, admission, images, revisions), 'backend-unready')
            return {'verified': True, 'image_id': admission['image_id'], 'scope': list(TARGETS)}
        return self.activate(key, rollback=verb == 'rollback')
