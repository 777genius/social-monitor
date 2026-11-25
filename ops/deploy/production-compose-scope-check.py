#!/usr/bin/env python3
"""Validate the rendered managed production Compose surface."""
import json
import pathlib
import sys
rendered_path, root, repo, control = sys.argv[1:]
with open(rendered_path, encoding="utf-8") as handle:
    config = json.load(handle)
expected_services = {
    "agent-runtime", "api", "caddy", "daily-runner", "delivery-service",
    "event-relay", "frontend", "ingestion-worker", "intelligence-worker",
    "migrate", "otel-collector", "rabbitmq", "redis", "x-collector",
}
services = config.get("services", {})
if set(services) != expected_services:
    raise SystemExit("rendered Compose service allowlist mismatch")
model_route = {
    "agent-runtime": {
        "AGENT_RUNTIME_PROVIDER": "codex",
        "AGENT_RUNTIME_MODEL": "gpt-5.6-sol",
        "AGENT_RUNTIME_REASONING_EFFORT": "high",
    },
    "daily-runner": {
        "READER_SUMMARY_MODEL_PROVIDER": "agent-runtime",
        "AGENT_RUNTIME_READER_SUMMARY_MODEL": "gpt-5.6-sol",
        "AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT": "high",
    },
}
for service_name, expected_environment in model_route.items():
    environment = services[service_name].get("environment", {})
    if any(environment.get(key) != value for key, value in expected_environment.items()):
        raise SystemExit(f"exact production model route mismatch for {service_name}")
expected_images = {
    "caddy": "caddy:2.11.4-alpine",
    "frontend": "nginx:1.29-alpine",
    "otel-collector": "otel/opentelemetry-collector-contrib:0.157.0@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6",
    "rabbitmq": "rabbitmq:4.3-management",
    "redis": "redis:8-alpine",
}
expected_dockerfiles = {
    "daily-runner": f"{control}/daily-runner.Dockerfile",
    "x-collector": f"{control}/x-collector.Dockerfile",
}
for name, service in services.items():
    forbidden = {
        "privileged": service.get("privileged"),
        "pid": service.get("pid"),
        "ipc": service.get("ipc"),
        "network_mode": service.get("network_mode"),
        "devices": service.get("devices"),
        "cap_add": service.get("cap_add"),
        "security_opt": service.get("security_opt"),
        "configs": service.get("configs"),
        "secrets": service.get("secrets"),
        "volumes_from": service.get("volumes_from"),
    }
    unexpected = sorted(key for key, value in forbidden.items() if value)
    if unexpected:
        raise SystemExit(f"forbidden Compose settings for {name}: {unexpected}")
    service_networks = service.get("networks") or {}
    if set(service_networks) != {"default"}:
        raise SystemExit(f"unexpected networks for {name}")
    image = service.get("image")
    build = service.get("build")
    if name in expected_images:
        if image != expected_images[name] or build is not None:
            raise SystemExit(f"unexpected image/build policy for {name}")
    elif image is not None:
        raise SystemExit(f"build service {name} must use the project-generated image name")
    elif not isinstance(build, dict) or build.get("context") != repo:
        raise SystemExit(f"unexpected build context for {name}")
    elif build.get("dockerfile") != expected_dockerfiles.get(name, "Dockerfile"):
        raise SystemExit(f"unexpected Dockerfile for {name}")
    elif not set(build).issubset({"args", "context", "dockerfile"}):
        raise SystemExit(f"unexpected build options for {name}")
    if name == "x-collector":
        expected_guard = f"{control}/deploy-state"
        expected_script = f"{control}/postgres-runtime-current/x-launch-guard.py"
        guard_mounts = [volume for volume in service.get("volumes") or []
                        if volume.get("target") == "/run/social-monitor-x-launch-state"]
        script_mounts = [volume for volume in service.get("volumes") or []
                         if volume.get("target") == "/run/social-monitor-x-launch-guard.py"]
        if len(guard_mounts) != 1 or guard_mounts[0].get("source") != expected_guard or \
                guard_mounts[0].get("read_only") is not True or \
                len(script_mounts) != 1 or script_mounts[0].get("source") != expected_script or \
                script_mounts[0].get("read_only") is not True or service.get("restart") != "no" or \
                service.get("entrypoint") != ["python", "/run/social-monitor-x-launch-guard.py", "container-exec"] or \
                service.get("command") != ["python", "-m", "x_collector"]:
            raise SystemExit("X launch guard mount or restart policy is invalid")
expected_ports = {
    "api": {("127.0.0.1", "13000", 3000, "tcp")},
    "frontend": {("127.0.0.1", "13080", 80, "tcp")},
    "caddy": {
        ("", "80", 80, "tcp"),
        ("", "443", 443, "tcp"),
        ("", "443", 443, "udp"),
    },
}
for name, service in services.items():
    actual = {
        (
            str(port.get("host_ip", "")),
            str(port.get("published", "")),
            int(port.get("target", 0)),
            str(port.get("protocol", "tcp")),
        )
        for port in service.get("ports") or []
    }
    if actual != expected_ports.get(name, set()):
        raise SystemExit(f"unexpected published ports for {name}: {sorted(actual)}")
    for volume in service.get("volumes") or []:
        volume_type = volume.get("type")
        source = str(volume.get("source", ""))
        if volume_type == "bind":
            try:
                resolved = pathlib.Path(source).resolve(strict=True)
                root_path = pathlib.Path(root).resolve(strict=True)
                resolved.relative_to(root_path)
            except (FileNotFoundError, RuntimeError, ValueError):
                raise SystemExit(f"bind mount escapes project root for {name}")
        elif volume_type == "volume":
            if source not in {"rabbitmq-data", "redis-data"}:
                raise SystemExit(f"unexpected named volume for {name}")
        else:
            raise SystemExit(f"unexpected volume type for {name}")
networks = config.get("networks", {})
if set(networks) != {"default"} or networks["default"].get("external") is True:
    raise SystemExit("unexpected or external Compose network")
if config.get("configs") or config.get("secrets"):
    raise SystemExit("top-level Compose configs or secrets are forbidden")
volumes = config.get("volumes", {})
if set(volumes) != {"rabbitmq-data", "redis-data"}:
    raise SystemExit("top-level Compose volume allowlist mismatch")
if any(value.get("external") is True for value in volumes.values()):
    raise SystemExit("external Compose volumes are forbidden")
