#!/usr/bin/env python3
"""Offline npm consumer regression; run on a hosted sandbox worker.

Usage: python3 ops/deploy/collector-image-packaging.test.py
  --sandbox-dependency-image sha256:ID --evidence-directory /tmp/UNIQUE

The preinstalled sandbox image must have the label
social-monitor.collector-packaging.synthetic-dependencies=true and matching
/app/package{,-lock}.json plus /app/node_modules, and the production Node 22
Bookworm tools (including timeout). Never supply a production image.
No pulls, installs, generation, compilation, services or capture are performed.
Two NEW images exercise the baseline/current production source COPY instructions
in a separate directory, with the real npm script, wrapper and TS entrypoint.
Only module loading and a pre-main CLI validation stop are qualified. This is
not a full image build or a real collection. --source-only leaves that proof
explicitly UNVERIFIED. Images and evidence are retained for independent review.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import uuid


REPO = Path(__file__).resolve().parents[2]
BASE = "7710e16849e5a2d73ea0f0cbcaab6214fc47e88e"
CONSUMER = "run:reader-summary-clean-real-day-collection"
STOP = "--artifact-directory and --exact-date-artifact-directory are exclusive"
GIB = 1024 ** 3


def digest(content):
    return hashlib.sha256(content).hexdigest()


def run(args, timeout=60, **kwargs):
    return subprocess.run(args, timeout=timeout, capture_output=True, **kwargs)


def git(*args):
    result = run(["git", "-C", str(REPO), *args],
                 env={"PATH": os.environ["PATH"], "GIT_NO_LAZY_FETCH": "1"})
    if result.returncode:
        raise RuntimeError("local Git evidence unavailable")
    return result.stdout.decode()


def instructions(recipe):
    return [line.strip() for line in recipe.replace("\\\n", " ").splitlines()
            if line.strip() and not line.strip().startswith("#")]


def source_copies(recipe):
    copies = []
    for line in instructions(recipe):
        if not line.startswith("COPY "):
            continue
        parts = shlex.split(line)[1:]
        sources = [part for part in parts[:-1] if not part.startswith("--")]
        if all(source in ("package.json", "package-lock.json", "tsconfig.json",
                          "tsconfig.build.json", "apps", "libs") or
               source.startswith("scripts/") for source in sources):
            copies.append((line, sources))
    return copies


def source_graph():
    """Stage repository imports/types; npm execution remains the assertion.

    Include type-only edges because the actual command uses checking ts-node.
    Directory COPY inputs are restricted to these public source files. Script
    inputs come ONLY from each recipe, so a missing packaged helper stays missing.
    """
    aliases = json.loads((REPO / "tsconfig.json").read_text())["compilerOptions"]["paths"]
    graph = {}

    def resolve(specifier, importer):
        candidates = []
        if specifier.startswith("."):
            candidates.append(importer.parent / specifier)
        else:
            for alias, targets in aliases.items():
                if alias == specifier:
                    candidates.extend(REPO / target for target in targets)
                elif "*" in alias and specifier.startswith(alias.split("*")[0]):
                    suffix = specifier[len(alias.split("*")[0]):]
                    candidates.extend(REPO / target.replace("*", suffix) for target in targets)
        for candidate in candidates:
            for path in (candidate, Path(str(candidate) + ".ts"),
                         Path(str(candidate) + ".mjs"), candidate / "index.ts"):
                if path.is_file():
                    return path.resolve()
        if candidates:
            raise RuntimeError(f"unresolved repository import in {importer.relative_to(REPO)}")
        return None

    def visit(path):
        name = str(path.relative_to(REPO))
        if name in graph:
            return
        graph[name] = []
        if path.suffix not in (".ts", ".js", ".mjs"):
            return
        for specifier in re.findall(
                r"\b(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s*)"
                r"[\"']([^\"']+)[\"']", path.read_text()):
            imported = resolve(specifier, path)
            if imported is not None:
                graph[name].append(str(imported.relative_to(REPO)))
                visit(imported)

    visit(REPO / "scripts/run-reader-summary-clean-real-day-collection.ts")
    visit(REPO / "scripts/run-with-timeout.mjs")
    return graph


def stage_context(directory, recipe, graph):
    tracked = set(git("ls-files", "-z").split("\0"))
    names = set()
    for _, sources in source_copies(recipe):
        for source in sources:
            if source in ("apps", "libs"):
                names.update(name for name in graph if name.startswith(source + "/"))
            else:
                # Fail closed on a future broad COPY or unreviewed asset.
                if not (REPO / source).is_file():
                    raise RuntimeError(f"expected explicit source COPY: {source}")
                names.add(source)
    for name in sorted(names):
        path = REPO / name
        if (name not in tracked or path.is_symlink() or
                any(part.startswith(".") for part in Path(name).parts) or
                re.search(r"(?:^|/)(?:test|tests|fixtures|auth)(?:/|$)|\.(?:spec|test)\.", name)):
            raise RuntimeError(f"non-public synthetic context input: {name}")
        target = directory / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(path.read_bytes())
        target.chmod(0o600)


def offline_recipe(dependency_image, recipe, manifest_hashes):
    # Keep source COPY and public permission normalization from the actual
    # production recipe. A fresh WORKDIR prevents inherited app/scripts from
    # hiding packaging omissions. Only installed dependencies are reused.
    permission = [line for line in instructions(recipe) if line.startswith("RUN chmod ")]
    if len(permission) != 1 or "USER node" not in instructions(recipe):
        raise RuntimeError("production permission/user contract changed")
    verify = (
        "const fs=require('node:fs'),crypto=require('node:crypto');"
        f"const expected={json.dumps(manifest_hashes)};"
        "for(const [name,hash] of Object.entries(expected))"
        "if(crypto.createHash('sha256').update(fs.readFileSync('/app/'+name))"
        ".digest('hex')!==hash)throw Error('sandbox dependency manifest mismatch');"
    )
    lines = [f"FROM {dependency_image}", "USER root", "WORKDIR /collector-packaging",
             "RUN node -e " + shlex.quote(verify),
             "RUN mkdir -p apps libs prisma scripts vendor dist && "
             "touch prisma.config.ts && ln -s /app/node_modules node_modules"]
    # Legacy builders lack COPY --chmod. Reproduce only the existing manifest
    # mode flag with chmod; all collector/source COPY instructions stay exact.
    lines.extend(line.replace("COPY --chmod=0644 package.json package-lock.json ./",
                              "COPY package.json package-lock.json ./")
                 for line, _ in source_copies(recipe))
    lines.extend(["RUN chmod 0644 package.json package-lock.json", permission[0], "ENV NODE_ENV=production",
                  'ENV PATH="/collector-packaging/node_modules/.bin:${PATH}"', "USER node"])
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sandbox-dependency-image")
    parser.add_argument("--baseline-ref", default=BASE)
    parser.add_argument("--evidence-directory", type=Path, required=True)
    parser.add_argument("--source-only", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.baseline_ref):
        parser.error("baseline must be an exact local SHA")
    evidence = args.evidence_directory.resolve()
    if evidence == REPO or REPO in evidence.parents:
        parser.error("evidence must stay outside the source worktree")
    evidence.mkdir(parents=True, exist_ok=False)
    result = {"base": args.baseline_ref, "head": git("rev-parse", "HEAD").strip(),
              "consumer": CONSUMER, "executableConsumerProof": "UNVERIFIED"}
    try:
        baseline = git("show", args.baseline_ref + ":Dockerfile")
        candidate = (REPO / "Dockerfile").read_text()
        graph = source_graph()
        (evidence / "source-graph.json").write_text(json.dumps(graph, indent=2) + "\n")
        packaged_scripts = {source for _, sources in source_copies(candidate)
                            for source in sources if source.startswith("scripts/")}
        missing = sorted(name for name in graph if name.startswith("scripts/") and
                         name not in packaged_scripts)
        if missing:
            raise RuntimeError("collector closure absent from COPY: " + ", ".join(missing))
        result["sourceClosure"] = "covered by explicit COPY"
        result["dockerfileSha256"] = digest(candidate.encode())
        for variant, recipe in (("old", baseline), ("new", candidate)):
            context = evidence / variant
            context.mkdir()
            stage_context(context, recipe, graph)
        if args.source_only:
            return 0
        docker_config = evidence / "empty-docker-config"
        docker_config.mkdir()
        docker = ["docker", "--host", "unix:///var/run/docker.sock",
                  "--config", str(docker_config)]
        environment = {"PATH": os.environ["PATH"], "DOCKER_BUILDKIT": "0"}

        def docker_run(arguments, timeout=60):
            return run(docker + arguments, timeout=timeout, env=environment)

        version = docker_run(["version", "--format", "{{.Server.Version}}"])
        if version.returncode:
            raise RuntimeError("local Docker daemon unavailable; executable consumer proof UNVERIFIED")
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", args.sandbox_dependency_image or ""):
            raise RuntimeError("supply an immutable synthetic dependency image ID; proof UNVERIFIED")
        available = int(re.search(r"MemAvailable:\s+(\d+)",
                                 Path("/proc/meminfo").read_text()).group(1)) * 1024
        if available < 2 * GIB or shutil.disk_usage(evidence).free < 4 * GIB:
            raise RuntimeError("insufficient sandbox build capacity; executable consumer proof UNVERIFIED")
        label = docker_run(["image", "inspect", "--format",
                            '{{index .Config.Labels "social-monitor.collector-packaging.synthetic-dependencies"}}',
                            args.sandbox_dependency_image])
        if label.returncode or label.stdout.strip() != b"true":
            raise RuntimeError("dependency image is not labeled as an isolated synthetic fixture")
        manifest_hashes = {name: digest((REPO / name).read_bytes())
                           for name in ("package.json", "package-lock.json")}
        identity = uuid.uuid4().hex
        for variant, recipe in (("old", baseline), ("new", candidate)):
            context = evidence / variant
            (context / "Dockerfile").write_text(
                offline_recipe(args.sandbox_dependency_image, recipe, manifest_hashes))
            tag = f"collector-packaging-{identity}:{variant}"
            built = docker_run(["build", "--pull=false", "--network=none", "--no-cache",
                                "--memory=1g", "--memory-swap=1g", "--cpu-period=100000",
                                "--cpu-quota=100000", "--tag", tag, str(context)], timeout=180)
            if built.returncode:
                raise RuntimeError(f"{variant} isolated source COPY build failed; proof UNVERIFIED")
            image_id = docker_run(["image", "inspect", "--format", "{{.Id}}", tag]).stdout.decode().strip()
            consumer_command = ["npm", "run", CONSUMER, "--", "--date", "2000-01-01",
                                "--artifact-directory", "/tmp/collector-output",
                                "--exact-date-artifact-directory", "/tmp/collector-output"]
            probe = docker_run([
                "run", "--pull=never", "--rm", "--name", f"collector-packaging-{identity}-{variant}",
                "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
                "--memory=1536m", "--cpus=1", "--pids-limit=128", "--user=node",
                "--tmpfs=/tmp:rw,nosuid,nodev,size=32m,mode=1777", "--workdir=/collector-packaging",
                "--entrypoint=env", image_id, "-i",
                "PATH=/collector-packaging/node_modules/.bin:/usr/local/bin:/usr/bin:/bin",
                "HOME=/tmp/collector-home", "NODE_ENV=production",
                "DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture",
                "SOCIAL_MONITOR_REDDIT_APP_ENV_PATH=/tmp/no-credentials",
                # Bound the container itself, even if the host Docker client
                # loses its connection. PID 1 exiting ends detached TS children.
                "timeout", "--signal=TERM", "--kill-after=5s", "90s",
                "sh", "-c", "mkdir -p /tmp/collector-output /tmp/collector-home && exec " +
                shlex.join(consumer_command)], timeout=120)
            output = probe.stdout + probe.stderr
            if variant == "old":
                passed = probe.returncode == 1 and b"MODULE_NOT_FOUND" in output and \
                    b"/collector-packaging/scripts/run-with-timeout.mjs" in output
                boundary = "missing npm wrapper"
            else:
                passed = probe.returncode == 1 and STOP.encode() in output and \
                    not re.search(rb"MODULE_NOT_FOUND|Cannot find module|TSError|Command timed out", output)
                boundary = "real entrypoint loaded; pre-main CLI validation stopped"
            result[variant] = {"image": image_id, "tag": tag, "exitCode": probe.returncode,
                               "command": consumer_command, "boundary": boundary,
                               "matched": passed, "outputSha256": digest(output)}
            if not passed:
                raise RuntimeError(f"{variant} npm consumer did not reach the expected boundary")
        result["executableConsumerProof"] = "VERIFIED_MODULE_LOADING_ONLY"
        return 0
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        result["blocker"] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        return 1
    finally:
        (evidence / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result))


if __name__ == "__main__":
    raise SystemExit(main())
