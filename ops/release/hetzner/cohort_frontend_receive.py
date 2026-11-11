"""Durably receive one independently authorized frontend artifact under the release lock."""
import os
from pathlib import Path
import re
import shutil
import stat
import tempfile
from bounds import receive_bytes
from contract import KEY, atomic, read_json, require, sync_dir, trusted
from frontend_bundle import MAX_ARCHIVE, MAX_CONTENT, MAX_TAR, _validate_bundle
from frontend_ingress import _authority, stage_frontend_artifact
from frontend_tree import tree_digest

FIELDS = ('sha', 'ci_run_id', 'ci_run_attempt', 'artifact_id', 'artifact_name', 'artifact_sha256', 'artifact_bytes')


def _sync_tree(root):
    """Flush staged regular files before atomically publishing their parent."""
    for current, directories, files in os.walk(root, topdown=False, followlinks=False):
        for name in files:
            path = Path(current) / name
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                require(stat.S_ISREG(os.fstat(fd).st_mode), 'frontend-stage-file')
                os.fsync(fd)
            finally:
                os.close(fd)
        for name in directories:
            require(not (Path(current) / name).is_symlink(), 'frontend-stage-directory')
        sync_dir(current)


def receive_frontend(core, sha, run, stream, authenticated=False):
    """Caller has fenced the machine and holds the shared release lock."""
    key = sha + '-' + run
    require(re.fullmatch(KEY, key), 'cohort-key')
    observed = core.host.evidence('cohort-frontend-authority' if authenticated else 'frontend-authority',
                                  {'sha': sha, 'ci_run_id': run})
    require(isinstance(observed, dict) and set(observed) == set(FIELDS) | {'version', 'observed_at'},
            'frontend-authority')
    authority = _authority({name: observed[name] for name in FIELDS})
    require(authority['sha'] == sha and authority['ci_run_id'] == run, 'frontend-authority-binding')
    root = core.state / 'cohort' / 'frontend'
    for path in (core.state / 'cohort', root, root / 'inbox', root / 'candidates'):
        path.mkdir(mode=0o700, exist_ok=True)
        trusted(path, directory=True)
        sync_dir(path.parent)
    # ZIP, extracted TGZ, bounded TAR spool and extracted tree coexist during staging.
    reserve = authority['artifact_bytes'] + MAX_ARCHIVE + MAX_TAR + MAX_CONTENT + 128 * 1024**2
    require(shutil.disk_usage(root).free >= reserve, 'disk-space')
    fd, name = tempfile.mkstemp(prefix='.upload-', dir=root / 'inbox')
    temporary = None
    try:
        with os.fdopen(fd, 'wb') as output:
            receive_bytes(stream, output, authority['artifact_bytes'])
            output.flush(); os.fsync(output.fileno())
        temporary = Path(tempfile.mkdtemp(prefix='.candidate-', dir=root / 'candidates'))
        proof = stage_frontend_artifact(Path(name), authority, temporary)
        bundle = temporary / 'bundle'
        os.rename(proof['root'], bundle)
        final = root / 'candidates' / key
        proof['root'] = str(final / 'bundle')
        require(tree_digest(bundle) == proof['tree_sha256'], 'frontend-tree-archive-mismatch')
        atomic(temporary / 'proof.json', proof, immutable=True)
        _sync_tree(temporary)
        if final.exists():
            trusted(final, directory=True)
            existing = read_json(trusted(final / 'proof.json'))
            require(existing == proof, 'frontend-candidate-conflict')
            previous = trusted(final / 'bundle', directory=True)
            require(tree_digest(previous) == existing['tree_sha256'], 'frontend-candidate-content-changed')
            _validate_bundle(previous, sha)
            return existing
        os.rename(temporary, final)
        temporary = None
        sync_dir(final.parent)
        return proof
    finally:
        if temporary is not None:
            shutil.rmtree(temporary)
        os.unlink(name)
