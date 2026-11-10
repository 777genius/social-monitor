"""Independently bind a frontend artifact to one successful main CI run."""
import re
from contract import require
from operator_config import exact, match
from operator_github import GitHub, REPO


def _artifact(gh, run, repo_id):
    sha, run_id, attempt = run['head_sha'], str(run['id']), str(run['run_attempt'])
    name = f'frontend-candidate-{sha}-{run_id}-{attempt}'
    observed, ids, total = [], set(), None
    for page in range(1, 101):
        value = gh.get(f'actions/runs/{run_id}/artifacts?per_page=100&page={page}')
        exact(value, ('total_count', 'artifacts'))
        require(type(value['total_count']) is int and 0 < value['total_count'] <= 10000
                and isinstance(value['artifacts'], list) and 0 < len(value['artifacts']) <= 100,
                'frontend-artifact-count')
        require(total is None or total == value['total_count'], 'frontend-artifact-race')
        total = value['total_count']
        for item in value['artifacts']:
            require(isinstance(item, dict) and type(item.get('id')) is int and item['id'] > 0
                    and item['id'] <= 999_999_999_999_999 and item['id'] not in ids, 'frontend-artifact-id')
            ids.add(item['id']); observed.append(item)
        require(len(observed) <= total, 'frontend-artifact-count')
        if len(observed) == total:
            break
        require(len(value['artifacts']) == 100, 'frontend-artifact-incomplete')
    require(total is not None and len(observed) == total, 'frontend-artifact-pagination')
    matches = [item for item in observed if item.get('name') == name]
    require(len(matches) == 1, 'frontend-artifact-identity')
    item = matches[0]; producer = item.get('workflow_run')
    require(isinstance(producer, dict) and producer.get('id') == run['id']
            and type(producer.get('id')) is int and producer.get('head_sha') == sha
            and producer.get('head_branch') == 'main' and producer.get('repository_id') == repo_id
            and type(producer.get('repository_id')) is int and producer.get('head_repository_id') == repo_id
            and type(producer.get('head_repository_id')) is int and item.get('expired') is False
            and isinstance(item.get('digest'), str) and re.fullmatch(r'sha256:[0-9a-f]{64}', item['digest'])
            and type(item.get('size_in_bytes')) is int and 0 < item['size_in_bytes'] <= 300_000_000,
            'frontend-artifact-binding')
    return {'sha': sha, 'ci_run_id': run_id, 'ci_run_attempt': attempt,
            'artifact_id': str(item['id']), 'artifact_name': name,
            'artifact_sha256': item['digest'], 'artifact_bytes': item['size_in_bytes']}


def frontend_authority(config, runner, binding):
    exact(binding, ('sha', 'ci_run_id'))
    require(match(r'[0-9a-f]{40}', binding['sha']) and match(r'[1-9][0-9]{0,14}', binding['ci_run_id']),
            'frontend-authority-binding')
    gh = GitHub(config, runner)
    sha, run_id = binding['sha'], binding['ci_run_id']
    require(gh.main() == sha, 'operator-not-current-main')
    run = gh.run(run_id, sha); jobs = gh.jobs(run); legacy = gh.legacy()
    repository = gh.get('')
    require(repository.get('full_name') == REPO and type(repository.get('id')) is int
            and repository['id'] > 0, 'frontend-repository')
    artifact = _artifact(gh, run, repository['id'])
    require(gh.main() == sha and gh.run(run_id, sha) == run and gh.jobs(run) == jobs
            and gh.legacy() == legacy and _artifact(gh, run, repository['id']) == artifact,
            'frontend-authority-race')
    final_repo = gh.get('')
    require(final_repo.get('full_name') == REPO and type(final_repo.get('id')) is int
            and final_repo['id'] == repository['id'], 'frontend-repository-race')
    config.recheck()
    return artifact
