#!/usr/bin/env python3
"""Run --local, or pass an immutable, sandbox app image ID for one offline build.

The image supplies installed dependencies and already-normalized manifests
(both manifest hashes and modes must match). Source COPY, generation,
compilation, permission and runtime instructions from the real Dockerfile
are exercised with 0600 files / 0700 directories and tools.
No image is pulled, package installed, service started or provider contacted.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import unittest


REPO = Path(__file__).resolve().parents[2]
DOCKERFILE = (REPO / "Dockerfile").read_text()
INSTRUCTIONS = DOCKERFILE.replace("\\\n", " ").splitlines()
COPIES = [shlex.split(line)[1:] for line in INSTRUCTIONS if line.startswith("COPY ")]
SOURCES = [part for copy in COPIES for part in copy[:-1] if not part.startswith("--")]
GIB = 1024 ** 3


def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=60, **kwargs)


def context(root):
    """Copy tracked public Docker inputs only; never include local credentials."""
    entries = run(["git", "ls-files", "-s", "-z", "--", *SOURCES], cwd=REPO,
                  capture_output=True).stdout.decode().split("\0")
    expected = {}
    for entry in filter(None, entries):
        metadata, name = entry.split("\t", 1)
        mode = metadata.split()[0]
        assert mode in ("100644", "100755"), f"unexpected input type: {name}"
        assert not any(part.startswith(".env") and part != ".env.example"
                       for part in Path(name).parts), f"private input: {name}"
        assert not (REPO / name).is_symlink(), f"symlink input: {name}"
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        content = (REPO / name).read_bytes()
        target.write_bytes(content)
        target.chmod(0o700 if mode == "100755" else 0o600)
        expected[name] = {"sha256": hashlib.sha256(content).hexdigest(),
                          "mode": 0o755 if mode == "100755" else 0o644}
    for directory, _, _ in os.walk(root):
        Path(directory).chmod(0o700)
    assert (root / "apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs").stat().st_mode & 0o777 == 0o600
    return expected


def offline_dockerfile(base):
    prefix, runtime = DOCKERFILE.split("RUN npm ci\n", 1)
    # Legacy builds support resource limits but not COPY --chmod. Reuse only
    # the manifests validated in the base image; all source copies stay exact.
    manifests = "COPY --chmod=0644 package.json package-lock.json ./"
    assert manifests in prefix.splitlines(), "manifest COPY contract changed"
    copies = "\n".join(line for line in prefix.splitlines()
                       if line.startswith("COPY ") and line != manifests)
    return (f"FROM {base} AS app\nWORKDIR /app\nUSER root\n{copies}\n{runtime}"
            # COPY preserves the root-owned source-context mode 0600.
            "\nCOPY apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs "
            "/permission-negative/contract.cjs\n")


class LocalPermissions(unittest.TestCase):
    def test_offline_build_preserves_source_instructions(self):
        generated = offline_dockerfile("sha256:" + "a" * 64)
        self.assertNotIn("--chmod", generated)
        self.assertNotIn("RUN npm ci", generated)
        self.assertIn(DOCKERFILE.split("RUN npm ci\n", 1)[1], generated)
        for line in INSTRUCTIONS:
            if line.startswith("COPY ") and "package.json package-lock.json" not in line:
                self.assertIn(line, generated.replace("\\\n", " "))

    def test_public_asset_modes_from_restrictive_context(self):
        with tempfile.TemporaryDirectory(prefix="runtime-source-permissions-") as path:
            root = Path(path)
            expected = context(root)
            # Generated output is checked too; the image test compiles real output.
            (root / "dist").mkdir(mode=0o700)
            (root / "dist/output.json").write_text("{}")
            (root / "dist/output.json").chmod(0o600)
            permissions = [shlex.split(line)[1:] for line in INSTRUCTIONS
                           if line.startswith("RUN chmod ")]
            self.assertEqual(len(permissions), 1)
            run(permissions[0], cwd=root)
            # The existing manifest COPY has its own permission normalization.
            for copy in COPIES:
                if "--chmod=0644" in copy:
                    for name in copy[1:-1]:
                        (root / name).chmod(0o644)
            for name, entry in expected.items():
                self.assertEqual((root / name).stat().st_mode & 0o777, entry["mode"], name)
                self.assertEqual(hashlib.sha256((root / name).read_bytes()).hexdigest(),
                                 entry["sha256"], name)
            for directory, _, _ in os.walk(root):
                if Path(directory) != root:
                    self.assertEqual(Path(directory).stat().st_mode & 0o777, 0o755, directory)
            self.assertEqual((root / "dist/output.json").stat().st_mode & 0o777, 0o644)

    def test_reviewed_daily_runner_inherits_app_assets(self):
        # The actual daily Dockerfile is control-owned, not present in this repo.
        # Verify the existing reviewed fixture against the controller's digest;
        # do not invent a Dockerfile or modify the controller/provenance pin.
        fixture = (REPO / "ops/deploy/daily-runner-image-bootstrap-lib.test.sh").read_text()
        daily = fixture.split("<<'DOCKERFILE'\n", 1)[1].split("\nDOCKERFILE", 1)[0] + "\n"
        library = (REPO / "ops/deploy/daily-runner-image-bootstrap-lib.sh").read_text()
        digest = re.search(r"^DAILY_RUNNER_BOOTSTRAP_DOCKERFILE_SHA256=(\w+)$",
                           library, re.MULTILINE).group(1)
        self.assertEqual(hashlib.sha256(daily.encode()).hexdigest(), digest)
        self.assertTrue(daily.startswith("FROM social-monitor-prod-intelligence-worker:latest\n"))
        self.assertTrue(daily.endswith("USER node\n"))
        self.assertEqual([line for line in daily.splitlines() if line.startswith("COPY ")],
                         [f"COPY --chown=node:node {name} /app/{name}"
                          for name in ("scripts", "ops", "test", "docs")])


def image_regression(base):
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", base), "pass an immutable sandbox app image ID"
    run(["docker", "version", "--format", "{{.Server.Version}}"])
    available = int(re.search(r"MemAvailable:\s+(\d+)", Path("/proc/meminfo").read_text()).group(1)) * 1024
    free = shutil.disk_usage(tempfile.gettempdir()).free
    load = os.getloadavg()[0]
    print(json.dumps({"cpus": os.cpu_count(), "load1": load,
                      "availableRamBytes": available, "freeDiskBytes": free}), flush=True)
    assert free >= 10 * GIB and available >= 4 * GIB, "insufficient build headroom"
    assert load <= os.cpu_count(), "host CPU is busy; defer the single build"
    isolation = ["--rm", "--read-only", "--network", "none", "--cap-drop", "ALL",
                 "--security-opt", "no-new-privileges", "--memory", "1g", "--cpus", "1",
                 "--workdir", "/app", "--entrypoint", "node"]
    manifests = {name: hashlib.sha256((REPO / name).read_bytes()).hexdigest()
                 for name in ("package.json", "package-lock.json")}
    run(["docker", "run", *isolation, base, "-e",
         "const assert = require('node:assert/strict'), fs = require('node:fs');"
         "for (const [name, hash] of Object.entries(JSON.parse(process.argv[1]))) {"
         "const path = '/app/' + name, stats = fs.statSync(path);"
         "assert.equal(stats.uid, 0); assert.equal(stats.mode & 0o777, 0o644);"
         "assert.equal(require('node:crypto').createHash('sha256')"
         ".update(fs.readFileSync(path)).digest('hex'), hash); }",
         json.dumps(manifests)])
    with tempfile.TemporaryDirectory(prefix="runtime-source-permissions-image-") as path:
        root = Path(path)
        build_context = root / "context"
        build_context.mkdir()
        expected = context(build_context)
        (build_context / "Dockerfile").write_text(offline_dockerfile(base))
        iidfile = root / "image.id"
        image_id = None
        try:
            # Legacy builder exposes per-step memory/CPU limits on OLD.
            command = ["docker", "build", "--pull=false", "--force-rm", "--network", "none",
                       "--memory", "3g", "--memory-swap", "3g", "--cpu-period", "100000",
                       "--cpu-quota", "200000", "--iidfile", str(iidfile), str(build_context)]
            with subprocess.Popen(command, env={**os.environ, "DOCKER_BUILDKIT": "0"}) as build:
                deadline = time.monotonic() + 600
                try:
                    while build.poll() is None:
                        assert time.monotonic() < deadline, "offline build exceeded 600 seconds"
                        assert shutil.disk_usage(root).free >= 6 * GIB, "disk reserve reached; stopping build"
                        time.sleep(1)
                finally:
                    if build.poll() is None:
                        build.terminate()
                        try:
                            build.wait(timeout=15)
                        except subprocess.TimeoutExpired:
                            build.kill()
                            build.wait(timeout=5)
                assert build.returncode == 0, "offline image build failed"
            image_id = iidfile.read_text().strip()
            assert re.fullmatch(r"sha256:[0-9a-f]{64}", image_id)
            user = run(["docker", "image", "inspect", "--format", "{{.Config.User}}", image_id],
                       capture_output=True, text=True).stdout.strip()
            assert user == "node", f"unexpected runtime user: {user}"
            probe = (REPO / "ops/deploy/support/runtime-source-permissions-image-probe.mjs").read_text()
            run(["docker", "run", "-i", *isolation, image_id, "--input-type=module", "-"],
                input="const expected = " + json.dumps(expected) + ";\n" + probe, text=True)
            print(json.dumps({"image": image_id, "sourceFiles": len(expected),
                              "offlineImagePermissions": "passed"}))
        finally:
            if image_id is not None:
                # Only the untagged image created by this test; never prune caches.
                run(["docker", "image", "rm", image_id])


if __name__ == "__main__":
    if sys.argv[1:] == ["--local"]:
        unittest.main(argv=[sys.argv[0]], verbosity=2)
    elif len(sys.argv) == 2:
        image_regression(sys.argv[1])
    else:
        sys.exit("usage: runtime-source-permissions.test.py --local | sha256:SANDBOX_APP_IMAGE_ID")
