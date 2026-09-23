#!/usr/bin/env python3
"""Persistent, fail-closed admission for managed X collector launches."""

import fcntl
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile


HOST_ROOT = Path("/var/data/social-monitor")
CONTAINER_STATE = Path("/run/social-monitor-x-launch-state")
VERSION = b"version=social-monitor-x-launch-hold-v1\n"


class Denied(Exception):
    pass


def state_dir(container=False):
    if container:
        return CONTAINER_STATE
    test_roots = (
        ("SOCIAL_MONITOR_X_LAUNCH_TEST_MODE", "SOCIAL_MONITOR_X_LAUNCH_TEST_ROOT"),
        ("SOCIAL_MONITOR_DAILY_RUN_TEST_MODE", "SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT"),
        ("SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE", "SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT"),
    )
    for mode, name in test_roots:
        if os.environ.get(mode) != "1":
            continue
        if Path(__file__).resolve().is_relative_to(HOST_ROOT):
            raise Denied("test mode is unavailable from installed control")
        root = Path(os.environ[name])
        if not root.is_absolute():
            raise Denied("test root must be below /tmp")
        try:
            root = root.resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            raise Denied("test root is unavailable") from exc
        if root == Path("/tmp") or not root.is_relative_to("/tmp"):
            raise Denied("test root must be below /tmp")
        return root / "control" / "deploy-state"
    return HOST_ROOT / "control" / "deploy-state"


def regular(path, mode=0o644):
    try:
        info = path.lstat()
    except OSError as exc:
        raise Denied(f"missing or unreadable {path.name}") from exc
    testing = any(os.environ.get(mode) == "1" for mode in (
        "SOCIAL_MONITOR_X_LAUNCH_TEST_MODE", "SOCIAL_MONITOR_DAILY_RUN_TEST_MODE",
        "SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE"))
    owner = os.getuid() if testing else 0
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != mode or info.st_uid != owner:
        raise Denied(f"unsafe {path.name}")
    return info


def directory(path):
    testing = any(os.environ.get(mode) == "1" for mode in (
        "SOCIAL_MONITOR_X_LAUNCH_TEST_MODE", "SOCIAL_MONITOR_DAILY_RUN_TEST_MODE",
        "SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE"))
    owner = os.getuid() if testing else 0
    for part in (path, path.parent, path.parent.parent):
        try:
            info = part.lstat()
        except OSError as exc:
            raise Denied("launch state directory is unavailable") from exc
        if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o022 or info.st_uid != owner:
            raise Denied("unsafe launch state directory")


def lock(directory_path, exclusive=False, nonblocking=False):
    directory(directory_path)
    path = directory_path / "x-launch.lock"
    before = regular(path)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        operation = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
        # A container may enter while its parent still holds a shared host
        # admission. Fail closed if a hold is queued instead of waiting on it.
        fcntl.flock(fd, operation | (fcntl.LOCK_NB if nonblocking else 0))
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
            raise Denied("launch lock changed")
        return fd
    except OSError as exc:
        raise Denied("launch lock cannot be acquired") from exc


def phase(directory_path):
    path = directory_path / "x-launch-state.v1"
    before = regular(path)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        with os.fdopen(fd, "rb") as stream:
            data = stream.read(128)
            after = os.fstat(stream.fileno())
    except OSError as exc:
        raise Denied("launch state cannot be read") from exc
    if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
        raise Denied("launch state changed")
    if data == VERSION + b"phase=allowed\n":
        return "allowed"
    if data == VERSION + b"phase=held\n":
        return "held"
    raise Denied("malformed launch state")


def write_phase(directory_path, new_phase):
    path = directory_path / "x-launch-state.v1"
    if path.exists() or path.is_symlink():
        phase(directory_path)
    temporary = None
    try:
        fd, temporary = tempfile.mkstemp(prefix=".x-launch-state.", dir=directory_path)
        os.fchmod(fd, 0o644)
        with os.fdopen(fd, "wb") as stream:
            stream.write(VERSION + f"phase={new_phase}\n".encode())
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        temporary = None
        directory_fd = os.open(directory_path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if temporary is not None:
            os.unlink(temporary)


def stop_managed_owners():
    testing = os.environ.get("SOCIAL_MONITOR_X_LAUNCH_TEST_MODE") == "1"
    docker = os.environ.get("SOCIAL_MONITOR_X_LAUNCH_TEST_DOCKER") if testing else "docker"
    ctr = os.environ.get("SOCIAL_MONITOR_X_LAUNCH_TEST_CTR") if testing else "ctr"
    if not docker or not ctr:
        raise Denied("owner inventory commands are unavailable")
    name = "social-monitor-prod-x-collector-1"
    listed = subprocess.run(
        [docker, "ps", "-aq", "--filter", f"name=^/{name}$"],
        capture_output=True, text=True, check=True,
    ).stdout.strip().splitlines()
    if len(listed) > 1:
        raise Denied("ambiguous Docker X owner")
    if listed:
        subprocess.run([docker, "stop", "-t", "10", name], check=True)
    task_id = "social-monitor-x-host-fallback"
    tasks = subprocess.run(
        [ctr, "-n", "moby", "tasks", "ls"], capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    if any(row.split() and row.split()[0] == task_id and "RUNNING" in row.split()
           for row in tasks):
        subprocess.run([ctr, "-n", "moby", "tasks", "kill", "--signal", "SIGKILL", task_id], check=True)
    docker_after = subprocess.run(
        [docker, "ps", "-q", "--filter", f"name=^/{name}$"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    tasks_after = subprocess.run(
        [ctr, "-n", "moby", "tasks", "ls"], capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    if docker_after or any(row.split() and row.split()[0] == task_id and "RUNNING" in row.split()
                           for row in tasks_after):
        raise Denied("managed X owner remains active")


def reject_detached_compose_run(command):
    if len(command) < 3 or command[1] != "compose":
        return
    args = command[2:]
    global_values = {"-f", "--file", "-p", "--project-name", "--profile",
                     "--env-file", "--project-directory", "--parallel",
                     "--progress", "--ansi"}
    global_flags = {"--all-resources", "--compatibility", "--dry-run", "--verbose"}
    index = 0
    while index < len(args):
        arg = args[index]
        if arg in global_values:
            index += 2
        elif arg in global_flags or any(arg.startswith(option + "=") for option in global_values):
            index += 1
        elif arg.startswith("-f") or arg.startswith("-p"):
            index += 1
        elif arg.startswith("-"):
            raise Denied("unknown Compose global option")
        else:
            break
    if index >= len(args) or args[index] != "run":
        return
    index += 1
    run_values = {"--add-host", "--cap-add", "--cap-drop", "--device", "--entrypoint",
                  "--env", "--env-from-file", "--gpus", "--group-add", "--hostname",
                  "--label", "--memory", "--name", "--network", "--platform", "--publish",
                  "--pull", "--user", "--volume", "--workdir", "--cpus"}
    run_flags = {"--build", "--interactive", "--no-build", "--no-deps", "--no-TTY",
                 "--publish-all", "--quiet", "--quiet-build", "--quiet-pull",
                 "--remove-orphans", "--rm", "--service-ports", "--use-aliases"}
    short_values = {"e", "l", "p", "u", "v", "w"}
    while index < len(args):
        arg = args[index]
        if arg == "--":
            return
        if arg == "--detach" or arg.startswith("--detach="):
            raise Denied("detached Compose run cannot be held safely")
        if arg in run_values:
            index += 2
        elif arg in run_flags or any(arg.startswith(option + "=") for option in run_values):
            index += 1
        elif arg.startswith("--"):
            raise Denied("unknown Compose run option")
        elif arg.startswith("-"):
            for position, flag in enumerate(arg[1:]):
                if flag == "d":
                    raise Denied("detached Compose run cannot be held safely")
                if flag in short_values:
                    index += 1 if position + 2 < len(arg) else 2
                    break
                if flag not in {"i", "P", "q", "T"}:
                    raise Denied("unknown Compose run option")
            else:
                index += 1
        else:
            return  # The service has been reached; remaining tokens are its command.


def init(directory_path):
    directory(directory_path)
    lock_path = directory_path / "x-launch.lock"
    if lock_path.exists() or lock_path.is_symlink():
        regular(lock_path)
    else:
        fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o644)
        os.close(fd)
    fd = lock(directory_path, exclusive=True)
    try:
        if (directory_path / "x-launch-state.v1").exists():
            raise Denied("launch state already exists; initialization refused")
        write_phase(directory_path, "held")
    finally:
        os.close(fd)


def main(argv):
    if not argv:
        raise Denied("mode required")
    action, *command = argv
    if not any(os.environ.get(mode) == "1" for mode in (
        "SOCIAL_MONITOR_X_LAUNCH_TEST_MODE", "SOCIAL_MONITOR_DAILY_RUN_TEST_MODE",
        "SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE")):
        os.environ["PATH"] = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    if action not in {"init", "check", "run", "container-exec", "hold", "allow"}:
        raise Denied("unsupported mode")
    if action == "container-exec":
        directory_path = state_dir(container=True)
    else:
        directory_path = state_dir()
    if action == "init":
        if command:
            raise Denied("unexpected arguments")
        init(directory_path)
        return 0
    fd = lock(directory_path, exclusive=action in {"hold", "allow"},
              nonblocking=action == "container-exec")
    try:
        current = phase(directory_path)
        if action == "hold":
            if command:
                raise Denied("unexpected arguments")
            if current != "held":
                write_phase(directory_path, "held")
            stop_managed_owners()
            return 0
        if action == "allow":
            if command:
                raise Denied("unexpected arguments")
            write_phase(directory_path, "allowed")
            return 0
        if current != "allowed":
            raise Denied("X source launch is held")
        if action == "check":
            if command:
                raise Denied("unexpected arguments")
            return 0
        if not command:
            raise Denied("launch command required")
        if action == "container-exec":
            os.close(fd)
            fd = -1
            os.execvp(command[0], command)
        reject_detached_compose_run(command)
        return subprocess.call(command)
    finally:
        if fd >= 0:
            os.close(fd)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (Denied, OSError, subprocess.CalledProcessError) as exc:
        print(f"x-launch-denied: {exc}", file=sys.stderr)
        sys.exit(75)
