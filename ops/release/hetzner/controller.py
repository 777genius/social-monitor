#!/usr/bin/env python3
"""Thin host release state machine. All executable code is outside the candidate."""
import sys
from pathlib import Path
# -I deliberately excludes caller-controlled import paths.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import os
import shutil
import tempfile
import time
from archive import inspect_archive
from bounds import receive_bytes
import evidence as policies
from contract import (Denied, MACHINE, Lock, atomic, canonical, digest,
                      load_config, parse, read_json, require, sync_dir, trusted)
from host import Host


class Controller:
    def __init__(self, config, host):
        self.c, self.host = config, host
        self.state, self.inbox = Path(config['state']), Path(config['inbox'])

    def path(self, family, key):
        return self.state / family / (key + '.json')

    def binding(self, item):
        return {k: item[k] for k in ('sha', 'ci_run_id', 'archive_sha256', 'image_id')}

    def identity(self):
        return Path('/etc/machine-id').read_text().strip()

    def fence(self):
        require(self.identity() == MACHINE, 'machine-id')

    def previous_revision(self, image_id):
        import re
        from contract import SHA
        revision = (self.host.image(image_id)['labels'] or {}).get('org.opencontainers.image.revision')
        require(isinstance(revision, str) and re.fullmatch(SHA, revision), 'previous-revision')
        return revision

    def release_evidence(self, item, revision=None):
        if revision is None:
            _, target = self.host.snapshot()
            revision = self.previous_revision(target['image'])
        evidence = self.host.evidence('release-evidence', {**self.binding(item), 'production_revision': revision})
        require(evidence.get('event') == 'push' and evidence.get('branch') == 'main'
                and evidence.get('head_sha') == item['sha'], 'ci-event')
        require(evidence.get('main_sha') == item['sha'], 'stale-main-skip')
        jobs = evidence.get('jobs')
        require(isinstance(jobs, list) and jobs and all(j == 'success' for j in jobs), 'ci-jobs')
        require(evidence.get('legacy_workflow') == 'disabled_manually', 'legacy-workflow')
        require(evidence.get('api_only') is True and evidence.get('schema_changed') is False
                and evidence.get('worker_sensitive_changed') is False, 'sensitive-change')
        return policies.compatibility(evidence, revision, item['sha'])

    def backup(self, item):
        live = self.host.evidence('postgres-identity', {})
        config_hash = self.host.private_digest(self.c['backup_identity']['config_path'])
        observed = self.host.evidence('backup', self.binding(item))
        require(self.host.private_digest(self.c['backup_identity']['config_path']) == config_hash,
                'backup-config-changed')
        return policies.backup(observed, self.binding(item), self.c, live=live, config_hash=config_hash)

    def database(self, item):
        evidence = self.host.evidence('database', self.binding(item))
        return policies.database(evidence, item['migrations'],
                                 self.c['backup_identity']['system_identifier'],
                                 self.c['evidence_max_age_seconds'])

    def retained_database(self, admission, observation):
        require(isinstance(admission.get('database'), dict)
                and digest(admission['database']) == admission.get('database_hash'),
                'admission-database-binding')
        for database in (admission['database'], observation):
            policies.historical_database(database, admission['migrations'],
                                         self.c['backup_identity']['system_identifier'])
        require(all(observation[k] == admission['database'][k]
                    for k in ('database', 'observer_role', 'port')),
                'admission-database-identity')

    def transaction_admission(self, key, tx):
        admission = read_json(self.path('admissions', key))
        require(admission['sha'] + '-' + admission['ci_run_id'] == key, 'admission-binding')
        require(tx.get('admission') == admission, 'transaction-binding')
        return admission

    def preflight(self):
        before, target = self.host.snapshot()
        # Adapter must query current host state, not a cached fixture. No mkdir, writes or import.
        result = self.host.evidence('preflight', {})
        require(result.get('legacy_workflow') == 'disabled_manually'
                and result.get('configured') is True, 'preflight-unconfigured')
        return {'environment': 'production-hetzner', 'machine_id': MACHINE,
                'snapshot': digest(before), 'api_image': target['image'],
                'compose': self.host.compose_fingerprint(), 'latch': (self.state / 'latch.json').exists()}

    def receive(self, args, stream):
        sha, run, archive_hash, image_id, count = args
        key, size = sha + '-' + run, int(count)
        require(size <= self.c['max_archive_bytes'], 'archive-size-limit')
        require(shutil.disk_usage(self.inbox).free >= size * 2 + 2 * 1024**3, 'disk-space')
        require(not (self.state / 'latch.json').exists(), 'latched')
        destination = self.inbox / (key + '.tar')
        fd, name = tempfile.mkstemp(prefix='.upload-', dir=self.inbox)
        try:
            with os.fdopen(fd, 'wb') as output:
                receive_bytes(stream, output, size)
                output.flush()
                os.fsync(output.fileno())
            metadata = inspect_archive(Path(name), archive_hash, image_id, sha, run,
                                       self.c['migration_root'])
            item = {'sha': sha, 'ci_run_id': run, 'archive_sha256': archive_hash,
                    'image_id': image_id, 'archive_bytes': size, **metadata}
            self.release_evidence(item)
            try:
                os.link(name, destination)
            except FileExistsError:
                require(destination.stat().st_size == size, 'archive-conflict')
                inspect_archive(destination, archive_hash, image_id, sha, run, self.c['migration_root'])
            sync_dir(self.inbox)
            atomic(self.path('imports', key), item, immutable=True)
            return item
        finally:
            os.unlink(name)

    def admission(self, key):
        item = read_json(self.path('imports', key))
        before, previous = self.host.snapshot()
        previous_sha = self.previous_revision(previous['image'])
        compatibility = self.release_evidence(item, previous_sha)
        backup, database = self.backup(item), self.database(item)
        archive = self.inbox / (key + '.tar')
        require(archive.stat().st_size == item['archive_bytes'], 'archive-size-changed')
        inspect_archive(archive, item['archive_sha256'], item['image_id'], item['sha'],
                        item['ci_run_id'], self.c['migration_root'])
        require(self.host.probe(previous['image'], previous_sha), 'previous-unready')
        admission = {**item, 'previous_image_id': previous['image'], 'previous_sha': previous_sha,
                     'snapshot_before': before, 'snapshot_before_hash': digest(before),
                     'compose_hash': self.host.compose_fingerprint(), 'backup': backup, 'compatibility': compatibility,
                     'migration_status': 'unchanged', 'database': database, 'database_hash': digest(database)}
        path = self.path('admissions', key)
        if path.exists():
            old = read_json(path)
            # Retries never replace the original backup/proof with a newly generated receipt.
            require(all(old.get(k) == admission.get(k) for k in
                        ('image_id', 'archive_sha256', 'previous_image_id', 'compose_hash',
                         'snapshot_before_hash', 'sha', 'ci_run_id', 'compatibility')), 'admission-conflict')
            self.retained_database(old, old.get('database'))
            return old
        atomic(path, admission, immutable=True)
        return admission

    def invariant(self, admission):
        snapshot, target = self.host.snapshot()
        require(snapshot == admission['snapshot_before'], 'non-target-changed')
        require(self.host.compose_fingerprint() == admission['compose_hash'], 'trusted-compose-changed')
        return snapshot, target

    def ready(self, image_id, sha):
        for attempt in range(self.c['probe_attempts']):
            if self.host.probe(image_id, sha):
                return True
            if attempt + 1 < self.c['probe_attempts']:
                time.sleep(self.c['probe_interval_seconds'])
        return False

    def finish(self, key, tx, outcome, probes):
        admission = self.transaction_admission(key, tx)
        self.retained_database(admission, tx.get('database'))
        snapshot, target = self.invariant(admission)
        expected = admission['image_id'] if outcome == 'activated' else admission['previous_image_id']
        require(target['image'] == expected and target['running'] is True, 'finish-image')
        receipt = {'schema': 'social-monitor-release-receipt-v1', **self.binding(admission),
                   'previous_image_id': admission['previous_image_id'], 'previous_sha': admission['previous_sha'],
                   'image_graph': admission['image_graph'], 'compatibility': admission['compatibility'], 'scope': ['api'],
                   'snapshot_before_hash': admission['snapshot_before_hash'],
                   'snapshot_after_hash': digest(snapshot), 'backup': tx['backup'],
                   'migration_status': admission['migration_status'], 'probes': probes,
                   'admission_database': admission['database'],
                   'admission_database_hash': admission['database_hash'],
                   'database': tx['database'], 'database_hash': digest(tx['database']),
                   'outcome': outcome, 'timings': {'started_at': tx['started_at'],
                                                'finished_at': int(time.time()),
                                                'started_at_ns': tx['started_at_ns']}}
        receipt_path = self.path('receipts', tx.get('receipt_key', key))
        if receipt_path.exists():
            old = read_json(receipt_path)
            require({k: v for k, v in old.items() if k != 'timings'} ==
                    {k: v for k, v in receipt.items() if k != 'timings'}, 'receipt-conflict')
            receipt = old
        else:
            atomic(receipt_path, receipt, immutable=True)
        tx['outcome'] = outcome
        atomic(self.path('transactions', key), tx)
        return receipt

    def rollback(self, key, tx):
        admission = self.transaction_admission(key, tx)
        receipt_path = self.path('receipts', tx.get('receipt_key', key))
        if receipt_path.exists() and read_json(receipt_path).get('outcome') == 'rolled-back':
            return self.reconcile(key, tx)
        tx['phase'] = 'rolling-back'
        atomic(self.path('transactions', key), tx)
        try:
            _, current = self.invariant(admission)
            require(current['image'] in (admission['image_id'], admission['previous_image_id']),
                    'rollback-target-drift')
            self.host.up(admission['previous_image_id'], self.path('overrides', key), admission['compose_hash'])
            require(self.ready(admission['previous_image_id'], admission['previous_sha']), 'rollback-unready')
            return self.finish(key, tx, 'rolled-back', {'target': False, 'previous': True})
        except Exception:
            # Crash-recovery will retry previous; activation remains forbidden until owner repair.
            if not (self.state / 'latch.json').exists():
                atomic(self.state / 'latch.json', {'key': key, 'reason': 'rollback-failed',
                                                  'at': int(time.time())}, immutable=True)
            raise Denied('rollback-failed-latched') from None

    def receipt_binding(self, receipt, admission):
        self.retained_database(admission, receipt.get('database'))
        require(all(receipt.get(k) == v for k, v in self.binding(admission).items())
                and all(receipt.get(k) == admission[k] for k in
                        ('previous_image_id', 'previous_sha', 'image_graph', 'compatibility',
                         'snapshot_before_hash', 'migration_status'))
                and receipt.get('admission_database') == admission['database']
                and receipt.get('admission_database_hash') == admission['database_hash']
                and digest(receipt.get('database')) == receipt.get('database_hash')
                and receipt.get('scope') == ['api']
                and receipt.get('snapshot_after_hash') == admission['snapshot_before_hash'], 'receipt-binding')

    def reconcile(self, key, tx):
        admission = self.transaction_admission(key, tx)
        receipt = read_json(self.path('receipts', tx.get('receipt_key', key)))
        self.receipt_binding(receipt, admission)
        require(receipt.get('database') == tx.get('database'), 'receipt-database-binding')
        self.invariant(admission)
        require(receipt['outcome'] in ('activated', 'rolled-back'), 'receipt-outcome')
        activated = receipt['outcome'] == 'activated'
        require(self.ready(admission['image_id'] if activated else admission['previous_image_id'],
                           admission['sha'] if activated else admission['previous_sha']), 'receipt-not-current')
        tx['outcome'] = receipt['outcome']
        atomic(self.path('transactions', key), tx)
        return receipt

    def exclusive(self, key):
        for other in (self.state / 'transactions').glob('*.json'):
            require(other == self.path('transactions', key)
                    or read_json(other).get('outcome') is not None, 'unfinished-release')

    def activate(self, key):
        require(not (self.state / 'latch.json').exists(), 'latched')
        tx_path, receipt_path = self.path('transactions', key), self.path('receipts', key)
        self.exclusive(key)
        if tx_path.exists() and read_json(tx_path)['phase'] == 'rolling-back' \
                and read_json(tx_path).get('outcome') is None:
            tx = read_json(tx_path)
            self.rollback(key, tx)
            raise Denied('rolled-back')
        if receipt_path.exists():
            tx = read_json(tx_path)
            receipt = self.reconcile(key, tx)
            require(receipt['outcome'] == 'activated', 'already-rolled-back')
            self.retention()
            return receipt
        admission = read_json(self.path('admissions', key))
        require(admission['sha'] + '-' + admission['ci_run_id'] == key, 'admission-binding')
        self.retained_database(admission, admission.get('database'))
        if tx_path.exists():
            tx = read_json(tx_path)
            require(tx['admission'] == admission, 'transaction-binding')
            if tx['phase'] == 'rolling-back':
                self.rollback(key, tx)
                raise Denied('rolled-back')
            # An interrupted up may have succeeded; only real verification can finalize it.
            try:
                self.retained_database(admission, tx.get('database'))
                self.invariant(admission)
                require(self.release_evidence(admission, admission['previous_sha']) == admission['compatibility'], 'compatibility-changed')
                tx['backup'] = self.backup(admission)
                database = self.database(admission)
                self.retained_database(admission, database)
                tx['database'] = database
                # Persist the fresh proof before immutable receipt publication can crash.
                atomic(self.path('transactions', key), tx)
                if self.ready(admission['image_id'], admission['sha']):
                    result = self.finish(key, tx, 'activated', {'target': True})
                    self.retention()
                    return result
            except Exception:
                if receipt_path.exists():
                    raise
            self.rollback(key, tx)
            raise Denied('rolled-back')
        require(self.previous_revision(admission['previous_image_id']) == admission['previous_sha'], 'previous-revision')
        require(self.release_evidence(admission, admission['previous_sha']) == admission['compatibility'], 'compatibility-changed')
        backup = self.backup(admission)
        database = self.database(admission)
        self.retained_database(admission, database)
        _, previous = self.invariant(admission)
        require(previous['image'] == admission['previous_image_id'], 'previous-drift')
        archive = self.inbox / (key + '.tar')
        require(archive.stat().st_size == admission['archive_bytes'], 'archive-size-changed')
        inspect_archive(archive, admission['archive_sha256'], admission['image_id'],
                        admission['sha'], admission['ci_run_id'], self.c['migration_root'])
        self.host.import_image(archive, admission)
        ledger_path = self.state / 'retention.json'
        ledger = read_json(ledger_path) if ledger_path.exists() else []
        owned = list(dict.fromkeys(ledger + [admission['previous_image_id'], admission['image_id']]))
        atomic(ledger_path, owned)
        self.host.retain([admission['previous_image_id'], admission['image_id']])
        tx = {'admission': admission, 'backup': backup, 'database': database, 'phase': 'activating', 'started_at': int(time.time()), 'started_at_ns': time.time_ns()}
        atomic(tx_path, tx, immutable=True)
        try:
            self.host.up(admission['image_id'], self.path('overrides', key), admission['compose_hash'])
            require(self.ready(admission['image_id'], admission['sha']), 'target-unready')
            receipt = self.finish(key, tx, 'activated', {'target': True})
        except Exception:
            if receipt_path.exists():
                raise
            self.rollback(key, tx)
            raise Denied('rolled-back') from None
        self.retention()
        return receipt

    def retention(self):
        ledger_path = self.state / 'retention.json'
        old = read_json(ledger_path) if ledger_path.exists() else []
        receipts = [read_json(p) for p in (self.state / 'receipts').glob('*.json')]
        receipts.sort(key=lambda r: r['timings']['started_at_ns'], reverse=True)
        images = []
        for receipt in receipts:
            for image in (receipt['image_id'], receipt['previous_image_id']):
                if image not in images:
                    images.append(image)
        keep = images[:3]
        self.host.retain(keep)
        protected = self.host.prune_owned(old, keep)
        atomic(ledger_path, keep + protected)

    def dispatch(self, command, stream=None):
        verb, args = parse(command)
        self.fence()
        with Lock(self.state / 'controller.lock'):
            if verb == 'status':
                return {'latch': (self.state / 'latch.json').exists(), 'environment': 'production-hetzner'}
            if verb == 'preflight':
                return self.preflight()
            if verb == 'receive':
                return self.receive(args, stream)
            if verb == 'receipt':
                return read_json(self.path('receipts', args[0]))
            key = '-'.join(args)
            if verb == 'admit':
                require(not (self.state / 'latch.json').exists(), 'latched')
                return self.admission(key)
            if verb == 'activate':
                return self.activate(key)
            tx = read_json(self.path('transactions', key))
            self.transaction_admission(key, tx)
            if verb == 'rollback':
                self.exclusive(key)
                published = self.path('receipts', tx.get('receipt_key', key))
                if published.exists():
                    receipt = read_json(published)
                    self.receipt_binding(receipt, tx['admission'])
                    require(receipt.get('database') == tx.get('database'), 'receipt-database-binding')
                    if receipt['outcome'] == 'rolled-back':
                        return self.reconcile(key, tx)
                    require(receipt['outcome'] == 'activated', 'receipt-outcome')
                    # Select separate rollback evidence from the published receipt even
                    # with no journal outcome or an unhealthy candidate after a crash.
                    _, target = self.invariant(tx['admission'])
                    require(target['image'] == tx['admission']['image_id'], 'rollback-not-current')
                    self.preflight()
                    tx['backup'] = self.backup(tx['admission'])
                    tx.pop('outcome', None)
                    tx['receipt_key'] = key + '-rollback'
                else:
                    require(tx.get('outcome') is None, 'missing-terminal-receipt')
                result = self.rollback(key, tx)
                self.retention()
                return result
            admission = tx['admission']
            self.retained_database(admission, tx.get('database'))
            if self.path('receipts', tx.get('receipt_key', key)).exists():
                self.reconcile(key, tx)
            snapshot, target = self.invariant(admission)
            require(self.ready(admission['image_id'], admission['sha']), 'verify-unready')
            return {'verified': True, 'image_id': target['image'], 'snapshot': digest(snapshot)}


def main():
    try:
        for path in Path(__file__).parent.iterdir():
            if path.suffix in ('.py', '.sh'):
                trusted(path)
        config = load_config()
        result = Controller(config, Host(config)).dispatch(os.environ.get('SSH_ORIGINAL_COMMAND', ''),
                                                          sys.stdin.buffer)
        sys.stdout.buffer.write(canonical(result) + b'\n')
        return 0
    except Denied as error:
        sys.stdout.buffer.write(canonical({'denied': str(error)}) + b'\n')
        return 1
    except Exception:
        # Adapter/Docker output and malformed payloads may contain secrets; never echo them.
        sys.stdout.buffer.write(b'{"denied":"invalid-host-state"}\n')
        return 1


if __name__ == '__main__':
    sys.exit(main())
