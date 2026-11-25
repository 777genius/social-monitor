"""Exact Compose delta for one API, worker and frontend release."""
import copy
import re
from contract import require, trusted
from frontend_host import MOUNTS, _check_scope, reject_shadow_mounts
from worker_host import SERVICE

BACKEND = ('api', SERVICE)


def override(before, images, sources):
    """Caller supplies the verified current model and trusted frontend sources."""
    require(set(images) == set(BACKEND) and all(isinstance(value, str) and
            re.fullmatch(r'sha256:[0-9a-f]{64}', value) for value in images.values()), 'cohort-images')
    require(set(sources) == set(MOUNTS), 'frontend-mount-targets')
    service = before.get('services', {}).get('frontend')
    require(isinstance(service, dict) and isinstance(service.get('volumes'), list), 'frontend-mounts')
    reject_shadow_mounts(service['volumes'], 'target')
    volumes = []
    for target, (_, directory) in MOUNTS.items():
        source = sources[target]
        require(isinstance(source, str) and '$' not in source, 'frontend-interpolated-path')
        source = str(trusted(source, directory=directory))
        matches = [item for item in service['volumes'] if isinstance(item, dict) and item.get('target') == target]
        require(len(matches) == 1 and matches[0].get('type') == 'bind' and
                matches[0].get('read_only') is True, 'frontend-mount-binding')
        item = copy.deepcopy(matches[0]); item['source'] = source
        volumes.append(item)
    return {'services': {**{service: {'image': images[service]} for service in BACKEND},
                         'frontend': {'volumes': volumes}}}


def check_scope(before, after, images, sources):
    """Only two backend image fields and three frontend bind sources may differ."""
    require(set(images) == set(BACKEND), 'cohort-images')
    after = copy.deepcopy(after)
    for name in BACKEND:
        require(name in before['services'] and name in after['services'] and
                after['services'][name].get('image') == images[name], 'cohort-image-binding')
        if 'image' in before['services'][name]:
            after['services'][name]['image'] = before['services'][name]['image']
        else:
            del after['services'][name]['image']
    _check_scope(before, after, sources)
