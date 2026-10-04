"""One fixed credential destination; caller holds the controller's nonwaiting lock."""
import os
from pathlib import Path
import re
import select
import stat
import tempfile
import time
from contract import require, trusted
from operator_config import TOKEN, load_installation

SECONDS = 5


def capture(stream):
    end = time.monotonic() + SECONDS
    data = bytearray()
    fd = stream.fileno()
    while True:
        wait = end - time.monotonic()
        require(wait > 0 and select.select([fd], [], [], wait)[0], 'observer-token-denied')
        chunk = os.read(fd, 4097 - len(data))
        require(time.monotonic() < end, 'observer-token-denied')
        if not chunk:
            require(re.fullmatch(rb'[A-Za-z0-9_]{20,4096}', data), 'observer-token-denied')
            return bytes(data)
        data.extend(chunk)
        require(len(data) <= 4096, 'observer-token-denied')


def existing(path, directory):
    try:
        info = os.stat(path.name, dir_fd=directory, follow_symlinks=False)
    except FileNotFoundError:
        return
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0
            and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1,
            'observer-token-denied')


def publish(data):
    require(os.geteuid() == 0, 'observer-token-denied')
    path = Path(TOKEN)
    parent = trusted(path.parent, directory=True)
    directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    temporary = None
    try:
        info, observed = os.fstat(directory), parent.lstat()
        require((info.st_dev, info.st_ino) == (observed.st_dev, observed.st_ino)
                and info.st_uid == 0 and not info.st_mode & 0o022, 'observer-token-denied')
        existing(path, directory)
        fd, temporary = tempfile.mkstemp(prefix='.observer-token-', dir=parent)
        with os.fdopen(fd, 'wb') as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        trusted(parent, directory=True)
        observed = parent.lstat()
        require((info.st_dev, info.st_ino) == (observed.st_dev, observed.st_ino),
                'observer-token-denied')
        existing(path, directory)
        os.replace(Path(temporary).name, path.name, src_dir_fd=directory, dst_dir_fd=directory)
        os.fsync(directory)
    finally:
        if temporary is not None:
            try:
                os.unlink(Path(temporary).name, dir_fd=directory)
            except FileNotFoundError:
                pass
        os.close(directory)


def configure(stream):
    # This narrow bootstrap skips only the missing old token, never observation validation.
    config = load_installation()
    config.validate_inputs()
    data = capture(stream)
    config.recheck()
    publish(data)
    config.validate()
    return {'observer_token': 'configured'}
