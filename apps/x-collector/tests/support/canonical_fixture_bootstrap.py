"""Materialize sealed plaintext test evidence offline; never import the package."""
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from x_collector.canonical_sdk_builders import MANIFEST_SHA256, SourcePinMismatch, verified_sources


EVIDENCE = Path(__file__).resolve().parents[4] / "test/fixtures/x-canonical/sdk-installed-source"
COMMAND_SHA256 = "55609464c4dc57b2f822940c35069a89ad28adcfc4818d0553c388f8a4facf20"


def _read_regular(path):
    if path.is_symlink() or not path.is_file():
        raise SourcePinMismatch("offline SDK evidence.regular")
    data = path.read_bytes()
    data.decode("utf8")
    return data


def materialize_sdk(evidence=EVIDENCE):
    """Verify exact closure and all bytes before writing a fresh temporary root.

    .py.txt files are unchanged handwritten vendor evidence, not generated code.
    Only the pinned pure-builder seam may execute selected AST declarations.
    No ignored cache, Git history, installation or environment override is used.
    """
    try:
        if evidence.is_symlink() or not evidence.is_dir():
            raise SourcePinMismatch("required offline SDK evidence.directory")
        manifest = _read_regular(evidence / "manifest.json")
        if hashlib.sha256(manifest).hexdigest() != MANIFEST_SHA256:
            raise SourcePinMismatch("offline SDK manifest.sha256")
        entries = json.loads(manifest)["files"]
        names = {entry["path"] for entry in entries}
        if len(entries) != 30 or len(names) != 30 or any(
                not name.startswith("Scweet/") or len(Path(name).parts) != 2 or
                ".." in Path(name).parts or not name.endswith(".py") for name in names):
            raise SourcePinMismatch("offline SDK evidence.paths")
        expected = {name + ".txt" for name in names} | {"manifest.json", "command.json"}
        found = set()
        for path in evidence.rglob("*"):
            name = path.relative_to(evidence).as_posix()
            if path.is_symlink():
                raise SourcePinMismatch("offline SDK evidence.symlink")
            if path.is_dir():
                if name != "Scweet":
                    raise SourcePinMismatch("offline SDK evidence.directory")
            elif path.is_file():
                found.add(name)
            else:
                raise SourcePinMismatch("offline SDK evidence.regular")
        if found != expected:
            raise SourcePinMismatch("offline SDK evidence.files")
        command = _read_regular(evidence / "command.json")
        if hashlib.sha256(command).hexdigest() != COMMAND_SHA256:
            raise SourcePinMismatch("offline SDK command.sha256")
        files = {"manifest.json": manifest}
        for entry in entries:
            name = entry["path"]
            data = _read_regular(evidence / (name + ".txt"))
            if hashlib.sha256(data).hexdigest() != entry["sha256"]:
                raise SourcePinMismatch("offline SDK " + name)
            files[name] = data
        temporary = TemporaryDirectory(prefix="x-canonical-sdk-")
        try:
            root = Path(temporary.name)
            for name, data in sorted(files.items()):
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            verified_sources(root)
            return temporary
        except BaseException:
            temporary.cleanup()
            raise
    except (OSError, KeyError, TypeError, ValueError) as error:
        if isinstance(error, SourcePinMismatch):
            raise
        raise SourcePinMismatch("required offline SDK evidence: " + str(evidence)) from error
