"""Fixed read-only GitHub API observations and an independently supplied review."""
import hashlib
from contract import Denied, canonical, digest, require
import evidence as core_policies
from operator_config import (EXECUTABLES, GH_DIR, REVIEW, TOKEN, decode, exact, github_auth_header,
                             match, private_bytes, sha_bytes)

REPO = '777genius/social-monitor'
CI = 'pull-request.yml'
JOBS = {
    'Static architecture and quality', 'Security and public contracts',
    *('Backend unit shard ' + str(i) + '/6' for i in range(1, 7)),
    'Backend build and sandbox contracts', 'Backend build and unit tests',
    'Backend end-to-end tests', 'PostgreSQL tenant isolation',
    'Reader Promotion V2 canary PostgreSQL 18',
    'Feed promotion snapshot and native plans PostgreSQL 18',
    'Reader-summary weekly review manifest PostgreSQL 18',
    'Reader Value V3 PostgreSQL 18 contracts',
    'Production immutable candidate', 'Production deploy lifecycle fixtures',
    'Production container and deploy lifecycle', 'Flutter architecture and tests',
}


class GitHub:
    def __init__(self, config, runner):
        self.config, self.runner = config, runner
        self._trees = {}  # Per-invocation immutable commit trees; never a persisted authority cache.

    def _read(self, suffix, accept, limit):
        self.config.recheck()
        header = github_auth_header(self.config)
        result = self.runner.run([
            EXECUTABLES['curl'], '--disable', '--fail', '--silent', '--location', '--proto', '=https',
            '--max-redirs', '0', '--header', 'Accept: ' + accept,
            '--header', 'X-GitHub-Api-Version: 2022-11-28', '--user-agent', 'social-monitor-release',
            *(['--header', '@-'] if header is not None else []),
            'https://api.github.com/repos/' + REPO + (('/' + suffix) if suffix else '')],
            data=header, env={}, limit=limit)
        self.config.recheck()
        return result

    def get(self, suffix):
        return decode(self._read(suffix, 'application/vnd.github+json', 16 * 1024**2))

    def legacy(self):
        value = self.get('actions/workflows/production-deploy.yml')
        require(value.get('path') == '.github/workflows/production-deploy.yml'
                and value.get('state') == 'disabled_manually', 'operator-legacy-workflow')
        return 'disabled_manually'

    def main(self):
        value = self.get('git/ref/heads/main')
        require(value.get('ref') == 'refs/heads/main'
                and value.get('object', {}).get('type') == 'commit'
                and match(r'[0-9a-f]{40}', value['object'].get('sha')), 'operator-main')
        return value['object']['sha']

    def run(self, run_id, sha):
        value = self.get('actions/runs/' + run_id)
        ci = self.get('actions/workflows/' + CI)
        require(ci.get('path') == '.github/workflows/' + CI and ci.get('state') == 'active'
                and type(ci.get('id')) is int and value.get('workflow_id') == ci['id']
                and type(value.get('id')) is int and str(value['id']) == run_id
                and type(value.get('run_attempt')) is int and 0 < value['run_attempt'] <= 1000
                and value.get('event') == 'push' and value.get('head_branch') == 'main'
                and value.get('head_sha') == sha and value.get('status') == 'completed'
                and value.get('conclusion') == 'success'
                and value.get('repository', {}).get('full_name') == REPO
                and value.get('head_repository', {}).get('full_name') == REPO, 'operator-ci-run')
        return {key: value[key] for key in ('id', 'run_attempt', 'workflow_id', 'head_sha',
                                          'head_branch', 'event', 'status', 'conclusion')}

    def jobs(self, run):
        observed, ids, names, total = [], set(), set(), None
        for page in range(1, 101):
            value = self.get('actions/runs/{id}/attempts/{run_attempt}/jobs?per_page=100&page='.format(**run) + str(page))
            exact(value, ('total_count', 'jobs'))
            require(type(value['total_count']) is int and 0 < value['total_count'] <= 10000
                    and isinstance(value['jobs'], list) and len(value['jobs']) <= 100,
                    'operator-ci-job-count')
            require(total is None or value['total_count'] == total, 'operator-ci-job-race')
            total = value['total_count']
            for job in value['jobs']:
                require(type(job.get('id')) is int and job['id'] > 0 and job['id'] not in ids
                        and job.get('run_id') == run['id'] and type(job['run_id']) is int
                        and job.get('run_attempt') == run['run_attempt'] and type(job['run_attempt']) is int
                        and job.get('head_sha') == run['head_sha']
                        and job.get('status') == 'completed' and job.get('conclusion') == 'success'
                        and job.get('name') in JOBS and job['name'] not in names,
                        'operator-ci-job')
                ids.add(job['id'])
                names.add(job['name'])
                observed.append({'id': job['id'], 'name': job['name'], 'run_id': run['id'],
                                 'run_attempt': run['run_attempt'], 'conclusion': 'success'})
            require(len(observed) <= total, 'operator-ci-job-count')
            if len(observed) == total:
                require(names == JOBS, 'operator-ci-missing-jobs')
                return sorted(observed, key=lambda job: job['name'])
            require(value['jobs'], 'operator-ci-incomplete-jobs')
        require(False, 'operator-ci-pagination')

    def tree(self, commit_sha):
        require(match(r'[0-9a-f]{40}', commit_sha), 'operator-commit')
        if commit_sha in self._trees:
            return self._trees[commit_sha]
        commit = self.get('git/commits/' + commit_sha)
        require(commit.get('sha') == commit_sha
                and match(r'[0-9a-f]{40}', commit.get('tree', {}).get('sha')), 'operator-commit')
        tree_sha = commit['tree']['sha']
        tree = self.get('git/trees/' + tree_sha + '?recursive=1')
        require(tree.get('sha') == tree_sha and tree.get('truncated') is False
                and isinstance(tree.get('tree'), list) and len(tree['tree']) <= 100000, 'operator-tree-completeness')
        result, paths = {}, set()
        for item in tree['tree']:
            path = item.get('path')
            require(isinstance(path, str) and 0 < len(path) <= 4096 and path not in paths
                    and not path.startswith('/') and not any(p in ('', '.', '..') for p in path.split('/'))
                    and all(ord(c) >= 32 and ord(c) != 127 for c in path)
                    and match(r'[0-9a-f]{40}', item.get('sha')), 'operator-tree-path')
            paths.add(path)
            require((item.get('type'), item.get('mode')) in {
                ('tree', '040000'), ('blob', '100644'), ('blob', '100755'),
                ('blob', '120000'), ('commit', '160000')}, 'operator-tree-mode')
            if item['type'] != 'tree':
                result[path] = {key: item[key] for key in ('mode', 'type', 'sha')}
        self._trees[commit_sha] = result
        return result

    def delta(self, base, head):
        old, new = self.tree(base), self.tree(head)
        paths = sorted(path for path in old.keys() | new.keys() if old.get(path) != new.get(path))
        require(paths and len(paths) <= 10000, 'operator-delta-count')
        if core_policies.WORKER_README in paths:
            for tree in (old, new):
                entry = tree.get(core_policies.WORKER_README)
                require(entry is not None and entry['type'] == 'blob'
                        and entry['mode'] == '100644', 'operator-worker-readme-mode')
        delta = [{'path': path, 'before': old.get(path), 'after': new.get(path)} for path in paths]
        return paths, digest(delta)


    def package_scripts(self, base, head, delta):
        """Only one CI check value may change, independently read from exact Git blobs."""
        paths, observed_delta = self.delta(base, head)
        require('package.json' in paths and observed_delta == delta, 'operator-package-delta')
        records, documents = [], []
        for tree in (self.tree(base), self.tree(head)):
            require('binding.gyp' not in tree, 'operator-package-build-contract')
            for path, sha in core_policies.PACKAGE_BUILD['files'].items():
                require(tree.get(path) == {'mode': '100644', 'type': 'blob', 'sha': sha},
                        'operator-package-build-contract')
            entry = tree.get('package.json')
            require(entry is not None and entry['mode'] == '100644' and entry['type'] == 'blob',
                    'operator-package-mode')
            raw = self._read('git/blobs/' + entry['sha'], 'application/vnd.github.raw+json', 128 * 1024)
            require(type(raw) is bytes and 0 < len(raw) <= 128 * 1024 and
                    hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == entry['sha'],
                    'operator-package-blob')
            try:
                raw.decode('utf-8')
            except UnicodeError:
                raise Denied('operator-package-json') from None
            require(b'\0' not in raw, 'operator-package-json')
            document = decode(raw, 128 * 1024)
            require(isinstance(document, dict) and isinstance(document.get('scripts'), dict)
                    and all(isinstance(v, str) for v in document['scripts'].values()), 'operator-package-json')
            scripts = document['scripts']
            require(all(scripts.get(k) == v for k, v in core_policies.PACKAGE_BUILD['scripts'].items())
                    and not set(scripts).intersection(core_policies.PACKAGE_BUILD['absent_hooks']),
                    'operator-package-build-contract')
            documents.append(document)
            records.append({'blob': entry['sha'], 'sha256': sha_bytes(raw)})
        old, new = documents
        require(set(old['scripts']) == set(new['scripts']), 'operator-package-scripts')
        changed = sorted(k for k in old['scripts'] if old['scripts'][k] != new['scripts'][k])
        require(changed == [core_policies.PACKAGE_CHECK], 'operator-package-scripts')
        normalized = {**new, 'scripts': {**new['scripts'], core_policies.PACKAGE_CHECK: old['scripts'][core_policies.PACKAGE_CHECK]}}
        require(canonical(old) == canonical(normalized), 'operator-package-fields')
        return {'base': base, 'head': head, 'delta_sha256': delta, 'changed_scripts': changed,
                'before_blob': records[0]['blob'], 'after_blob': records[1]['blob'],
                'before_sha256': records[0]['sha256'], 'after_sha256': records[1]['sha256'],
                'build_contract_sha256': digest(core_policies.PACKAGE_BUILD)}


def scope(paths):
    schema = any(p.startswith('prisma/') or p.rsplit('/', 1)[-1] == 'schema.prisma'
                 or '/prisma/migrations/' in p for p in paths if not p.startswith('docs/'))
    worker = any(p.startswith(('apps/intelligence-worker/', 'apps/ingestion-worker/',
                              'apps/agent-runtime/', 'apps/x-collector/', 'libs/agent-runtime/'))
                 for p in paths if not p.startswith('docs/') and p != core_policies.WORKER_README)
    compose = any(p.startswith('ops/compose/') or match(
        r'(?:docker-compose|compose)(?:[.-][a-zA-Z0-9_-]+)*\.ya?ml', p.rsplit('/', 1)[-1])
        for p in paths if not p.startswith('docs/'))
    return {'api_only': not (schema or worker or compose), 'schema_changed': schema,
            'worker_sensitive_changed': worker}


def release(config, runner, binding):
    gh = GitHub(config, runner)
    sha, base = binding['sha'], binding['production_revision']
    require(gh.main() == sha, 'operator-not-current-main')
    legacy = gh.legacy()
    run = gh.run(binding['ci_run_id'], sha)
    jobs = gh.jobs(run)
    paths, delta = gh.delta(base, sha)
    review_bytes = private_bytes(REVIEW)
    config.pin(REVIEW, sha_bytes(review_bytes))
    proof = decode(review_bytes, 65536)
    exact(proof, ('version', 'base', 'head', 'delta_sha256', 'paths_sha256',
                  'independent_review', 'all_shared_dependencies_reviewed', 'compatible'))
    require(type(proof['version']) is int and proof['version'] == 1, 'operator-review-version')
    compatibility = {key: value for key, value in proof.items() if key != 'version'}
    compatibility['evidence_sha256'] = sha_bytes(review_bytes)
    result = {'main_sha': sha, 'head_sha': sha, 'event': 'push', 'branch': 'main',
              'jobs': [job['conclusion'] for job in jobs], 'job_observations': jobs,
              'run_attempt': run['run_attempt'], 'repository': REPO,
              'legacy_workflow': legacy, **scope(paths),
              'production_revision': base, 'diff_base': base, 'diff_head': sha,
              'complete_delta': True, 'changed_paths': paths, 'delta_sha256': delta,
              'compatibility': compatibility}
    core_policies.compatibility(result, base, sha)  # Preserve the canonical fail-closed policy.
    require(gh.main() == sha and gh.run(binding['ci_run_id'], sha) == run
            and gh.jobs(run) == jobs and gh.legacy() == legacy, 'operator-ci-race')
    config.recheck()
    return result


def backend_release(config, runner, binding):
    """Exact current-main CI and complete deltas for both running image revisions."""
    gh = GitHub(config, runner)
    sha = binding['sha']
    require(gh.main() == sha, 'operator-not-current-main')
    legacy, run = gh.legacy(), gh.run(binding['ci_run_id'], sha)
    jobs = gh.jobs(run)
    revisions = {'api': binding['api_revision'], 'jev-intelligence-worker': binding['worker_revision']}
    deltas = {}
    observed = {}
    for service, base in revisions.items():
        if base not in observed:
            paths, checksum = ([], digest([])) if base == sha else gh.delta(base, sha)
            package = gh.package_scripts(base, sha, checksum) if 'package.json' in paths else None
            observed[base] = (paths, checksum, package)
        paths, checksum, package = observed[base]
        deltas[service] = {'base': base, 'head': sha, 'complete_delta': True,
                           'changed_paths': paths, 'delta_sha256': checksum}
        if package is not None:
            deltas[service]['package_scripts'] = package
    result = {**binding, 'policy': 'backend-cohort-ci-v1', 'main_sha': sha, 'head_sha': sha,
              'event': 'push', 'branch': 'main', 'legacy_workflow': legacy,
              'jobs': [job['conclusion'] for job in jobs], 'job_observations': jobs,
              'run_attempt': run['run_attempt'], 'deltas': deltas}
    core_policies.backend_compatibility(result, revisions, sha, binding['non_target_snapshot_sha256'])
    require(gh.main() == sha and gh.run(binding['ci_run_id'], sha) == run and gh.jobs(run) == jobs
            and gh.legacy() == legacy, 'operator-ci-race')
    config.recheck()
    return result
