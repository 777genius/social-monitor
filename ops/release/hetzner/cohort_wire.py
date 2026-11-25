"""Fixed, root-owned wiring for staged full-stack cohort transactions."""
from pathlib import Path
import re
from cohort_controller import CohortRelease
from contract import KEY, read_json, require, sync_dir, trusted
from frontend_probe_runtime import make_runtime_frontend_probe
from frontend_verifier import write_frontend_verifier


def dispatch(core, verb, args):
    """The controller has fenced the machine and holds the shared release lock."""
    require(verb in ('admit', 'activate', 'rollback', 'verify', 'receipt'), 'cohort-verb')
    if verb == 'receipt':
        require(len(args) == 1, 'cohort-key')
        rollback = args[0].endswith('-rollback')
        key = args[0][:-len('-rollback')] if rollback else args[0]
    else:
        require(len(args) == 2, 'cohort-key')
        key, rollback = '-'.join(args), False
    require(re.fullmatch(KEY, key), 'cohort-key')
    engine = CohortRelease(core, make_runtime_frontend_probe())
    if verb == 'receipt':
        return engine.receipt(key, rollback=rollback)
    if verb == 'activate':
        return engine.activate(key)
    if verb == 'rollback':
        return engine.rollback(key)
    if verb == 'verify':
        return engine.verify(key)
    engine.available(); engine.exclusive(key)
    root = core.state / 'cohort'
    frontend = root / 'frontend' / 'candidates' / key
    backend = root / 'backend'
    proof = read_json(trusted(frontend / 'proof.json'))
    item = read_json(trusted(backend / 'imports' / (key + '.json')))
    bundle = trusted(frontend / 'bundle', directory=True)
    require(proof.get('root') == str(bundle), 'cohort-frontend-binding')
    archive = trusted(backend / 'inbox' / (key + '.tar'))
    verifiers = root / 'verifiers'
    verifiers.mkdir(mode=0o700, exist_ok=True); trusted(verifiers, directory=True); sync_dir(verifiers.parent)
    verifier = write_frontend_verifier(bundle, proof.get('tree_sha256'), verifiers / (key + '.sh'))
    sources = {'/usr/share/nginx/public': str(bundle / 'public'),
               '/usr/share/nginx/admin': str(bundle / 'admin'),
               '/run/bootstrap/verify-static-release.sh': verifier['path']}
    return engine.admit(key, item, proof, sources, archive, verifier['sha256'])
