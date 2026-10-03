"""Fixed read-only GitHub API observations and an independently supplied review."""
import hashlib
from contract import digest, require
import evidence as core_policies
from operator_config import (EXECUTABLES, GH_DIR, REVIEW, TOKEN, decode, exact,
                             match, private_bytes, sha_bytes)

REPO = '777genius/social-monitor'
CI = 'pull-request.yml'
JOBS = {
    'Static architecture and quality', 'Security and public contracts',
    *('Backend unit shard ' + str(i) + '/4' for i in range(1, 5)),
    'Backend build and sandbox contracts', 'Backend build and unit tests',
    'Backend end-to-end tests', 'PostgreSQL tenant isolation',
    'Reader Promotion V2 canary PostgreSQL 18',
    'Feed promotion snapshot and native plans PostgreSQL 18',
    'Reader-summary weekly review manifest PostgreSQL 18',
    'Reader Value V3 PostgreSQL 18 contracts',
    'Production container and deploy lifecycle', 'Flutter architecture and tests',
}


class GitHub:
    def __init__(self, config, runner):
        self.config, self.runner = config, runner

    def get(self, suffix):
        self.config.recheck()
        token = private_bytes(TOKEN, secret=True).strip().decode('ascii')
        result = decode(self.runner.run([
            EXECUTABLES['gh'], 'api', '--hostname', 'github.com', '--method', 'GET',
            '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28',
            'repos/' + REPO + '/' + suffix], env={
                'GH_TOKEN': token, 'GH_CONFIG_DIR': GH_DIR, 'GH_PROMPT_DISABLED': '1',
                'GH_NO_UPDATE_NOTIFIER': '1', 'GH_NO_EXTENSION_UPDATE_NOTIFIER': '1'}, limit=16 * 1024**2))
        self.config.recheck()
        return result

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
        return result

    def delta(self, base, head):
        old, new = self.tree(base), self.tree(head)
        paths = sorted(path for path in old.keys() | new.keys() if old.get(path) != new.get(path))
        require(paths and len(paths) <= 10000, 'operator-delta-count')
        delta = [{'path': path, 'before': old.get(path), 'after': new.get(path)} for path in paths]
        return paths, digest(delta)


def scope(paths):
    schema = any(p.startswith('prisma/') or p.rsplit('/', 1)[-1] == 'schema.prisma'
                 or '/prisma/migrations/' in p for p in paths if not p.startswith('docs/'))
    worker = any(p.startswith(('apps/intelligence-worker/', 'apps/ingestion-worker/',
                              'apps/agent-runtime/', 'apps/x-collector/', 'libs/agent-runtime/'))
                 for p in paths if not p.startswith('docs/'))
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
