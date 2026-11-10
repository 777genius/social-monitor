"""Stage a bounded backend candidate; qualification still occurs before activation."""
import os
from pathlib import Path
import re
import shutil
import tempfile
from archive import inspect_archive
from bounds import receive_bytes
from contract import DIGEST, KEY, atomic, require, sync_dir, trusted


def receive_backend(core, args, stream):
    """Caller owns the release lock; receiving data never imports or starts an image."""
    sha, run, checksum, image, count = args
    key = sha + '-' + run
    require(re.fullmatch(KEY, key) and re.fullmatch(DIGEST, checksum) and re.fullmatch(DIGEST, image)
            and re.fullmatch(r'[1-9][0-9]{0,11}', count), 'cohort-backend-binding')
    size = int(count)
    require(size <= core.c['max_archive_bytes'], 'archive-size-limit')
    root = core.state / 'cohort' / 'backend'
    for path in (core.state / 'cohort', root, root / 'inbox', root / 'imports'):
        path.mkdir(mode=0o700, exist_ok=True)
        trusted(path, directory=True); sync_dir(path.parent)
    require(shutil.disk_usage(root).free >= size * 2 + 2 * 1024**3, 'disk-space')
    fd, name = tempfile.mkstemp(prefix='.upload-', dir=root / 'inbox')
    try:
        with os.fdopen(fd, 'wb') as output:
            receive_bytes(stream, output, size)
            output.flush(); os.fsync(output.fileno())
        metadata = inspect_archive(Path(name), checksum, image, sha, run, core.c['migration_root'])
        item = {'sha': sha, 'ci_run_id': run, 'archive_sha256': checksum,
                'image_id': image, 'archive_bytes': size, **metadata}
        destination = root / 'inbox' / (key + '.tar')
        try:
            os.link(name, destination)
        except FileExistsError:
            trusted(destination)
            require(destination.stat().st_size == size, 'archive-conflict')
            inspect_archive(destination, checksum, image, sha, run, core.c['migration_root'])
        sync_dir(destination.parent)
        atomic(root / 'imports' / (key + '.json'), item, immutable=True)
        return item
    finally:
        os.unlink(name)
