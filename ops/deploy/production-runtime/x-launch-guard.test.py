#!/usr/bin/env python3
"""Disposable admission fixtures; no Docker, ctr, service or provider calls."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest


HERE = Path(__file__).resolve().parent
GUARD = HERE / "x-launch-guard.py"


class LaunchGuardTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="x-launch-guard-", dir="/tmp")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / "control" / "deploy-state"
        self.runtime = self.root / "control" / "postgres-runtime-current"
        self.state.mkdir(parents=True)
        self.runtime.mkdir()
        self.installed_guard = self.runtime / GUARD.name
        self.installed_guard.write_bytes(GUARD.read_bytes())
        self.log = self.root / "effects"
        fake = self.root / "fake-command"
        fake.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$EFFECT_LOG\"\n"
                        "case \"$*\" in *'tasks ls'*) printf 'TASK PID STATUS\\n';; esac\n")
        fake.chmod(0o755)
        self.fake = fake
        self.env = dict(os.environ, SOCIAL_MONITOR_X_LAUNCH_TEST_MODE="1",
                        SOCIAL_MONITOR_X_LAUNCH_TEST_ROOT=str(self.root),
                        SOCIAL_MONITOR_X_LAUNCH_TEST_DOCKER=str(fake),
                        SOCIAL_MONITOR_X_LAUNCH_TEST_CTR=str(fake),
                        SOCIAL_MONITOR_X_LAUNCH_TEST_SYSTEMCTL=str(fake),
                        SOCIAL_MONITOR_X_LAUNCH_TEST_GUARD=str(self.installed_guard),
                        EFFECT_LOG=str(self.log))

    def call(self, *args, script=GUARD, env=None):
        command = ["python3", str(script), *args] if script.suffix == ".py" else ["bash", str(script), *args]
        return subprocess.run(command, env=env or self.env, capture_output=True, text=True)

    def assert_no_effect(self, result):
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertFalse(self.log.exists(), self.log.read_text() if self.log.exists() else "")

    def init_allow(self):
        self.assertEqual(self.call("init").returncode, 0)
        self.assertEqual(self.call("allow").returncode, 0)

    def test_default_hold_and_unsafe_state(self):
        self.assert_no_effect(self.call("run", str(self.fake), "provider"))
        self.assertEqual(self.call("init").returncode, 0)
        self.assert_no_effect(self.call("run", str(self.fake), "provider"))
        state = self.state / "x-launch-state.v1"
        self.assertEqual(state.read_text(), "version=social-monitor-x-launch-hold-v1\nphase=held\n")
        self.assertEqual(self.call("allow").returncode, 0)
        self.assertEqual(self.call("run", str(self.fake), "provider").returncode, 0)
        self.log.unlink()
        for unsafe in (b"bad\n", b"version=social-monitor-x-launch-hold-v1\nphase=allow\n"):
            state.write_bytes(unsafe)
            self.assert_no_effect(self.call("run", str(self.fake), "provider"))
        state.unlink()
        state.symlink_to(self.root / "other")
        self.assert_no_effect(self.call("run", str(self.fake), "provider"))
        state.unlink()
        state.write_bytes(b"version=social-monitor-x-launch-hold-v1\nphase=allowed\n")
        state.chmod(0)
        self.assert_no_effect(self.call("run", str(self.fake), "provider"))
        state.chmod(0o644)
        (self.state / "x-launch.lock").unlink()
        self.assert_no_effect(self.call("run", str(self.fake), "provider"))

    def test_test_mode_roots_cannot_escape_tmp(self):
        escaped = "/tmp/.." + str(HERE)
        cases = (
            (GUARD, ("check",), {"SOCIAL_MONITOR_X_LAUNCH_TEST_ROOT": escaped}),
            (HERE / "x-launch-docker-compose.sh", ("config",),
             {"SOCIAL_MONITOR_X_LAUNCH_TEST_ROOT": escaped}),
            (HERE / "rolling-containerd-fallback.sh", ("run",),
             {"SOCIAL_MONITOR_X_LAUNCH_TEST_ROOT": escaped}),
            (HERE / "daily-run.sh", ("--yesterday",),
             {"SOCIAL_MONITOR_DAILY_RUN_TEST_MODE": "1",
              "SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT": escaped}),
            (HERE / "rolling-run.sh", (),
             {"SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE": "1",
              "SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT": escaped}),
        )
        for script, args, extra in cases:
            self.assert_no_effect(self.call(*args, script=script, env=dict(self.env, **extra)))

    def test_entrypoints_refuse_before_fake_effects(self):
        self.assertEqual(self.call("init").returncode, 0)
        wrapper = HERE / "x-launch-docker-compose.sh"
        daily = HERE / "daily-run.sh"
        rolling = HERE / "rolling-run.sh"
        fallback = HERE / "rolling-containerd-fallback.sh"
        for script, args, extra in (
            (wrapper, ("-p", "social-monitor-prod", "--profile", "app", "up", "-d"), {}),
            (wrapper, ("-p", "social-monitor-prod", "run", "x-collector"), {}),
            (daily, ("--yesterday",), {"SOCIAL_MONITOR_DAILY_RUN_TEST_MODE": "1",
                                       "SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT": str(self.root)}),
            (rolling, (), {"SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE": "1",
                           "SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT": str(self.root),
                           "SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER": str(self.fake)}),
            (fallback, (), {}),
        ):
            env = dict(self.env, **extra)
            self.assert_no_effect(self.call(*args, script=script, env=env))
            self.installed_guard.unlink()
            self.assert_no_effect(self.call(*args, script=script, env=env))
            self.installed_guard.write_bytes(GUARD.read_bytes())
            self.installed_guard.chmod(0)
            self.assert_no_effect(self.call(*args, script=script, env=env))
            self.installed_guard.unlink()
            self.installed_guard.symlink_to(GUARD)
            self.assert_no_effect(self.call(*args, script=script, env=env))
            self.installed_guard.unlink()
            self.installed_guard.write_bytes(GUARD.read_bytes())
        self.assertEqual(self.call("allow").returncode, 0)
        allowed = self.call("-p", "social-monitor-prod", "up", "-d", script=wrapper)
        self.assertEqual(allowed.returncode, 0, allowed.stderr)
        self.assertIn("compose -p social-monitor-prod up -d", self.log.read_text())
        self.assertIn("x-launch-docker-up.sh", (HERE / "social-monitor-prod.service").read_text())
        self.assertIn("container-exec", (HERE / "x-collector.Dockerfile").read_text())
        overlay = (HERE / "compose.x-launch-guard.yml").read_text()
        self.assertIn("restart: \"no\"", overlay)
        self.assertIn("/run/social-monitor-x-launch-state:ro", overlay)
        self.assertIn("/run/social-monitor-x-launch-guard.py:ro", overlay)
        self.assertIn("x-launch-docker-compose.sh", (HERE.parent / "social-monitor-production-deploy.sh").read_text())

    def test_compose_launch_variants_require_host_admission(self):
        wrapper = HERE / "x-launch-docker-compose.sh"
        launches = (
            ("-p", "social-monitor-prod", "--profile", "app", "up", "-d"),
            ("up", "--no-deps"),
            ("up", "-d", "--no-deps"),
            ("up", "--no-deps", "x-collector"),
            ("start",),
            ("start", "api"),
            ("restart",),
            ("restart", "api"),
            ("run", "api"),
            ("run", "--no-deps", "api"),
            ("run", "-d", "x-collector"),
            ("run", "--no-deps", "x-collector"),
        )
        self.assertEqual(self.call("init").returncode, 0)
        for args in launches:
            with self.subTest(args=args, state="held"):
                self.assert_no_effect(self.call(*args, script=wrapper))
        self.assertEqual(self.call("allow").returncode, 0)
        for args in launches:
            with self.subTest(args=args, state="missing guard"):
                self.installed_guard.unlink()
                self.assert_no_effect(self.call(*args, script=wrapper))
                self.installed_guard.write_bytes(GUARD.read_bytes())
            with self.subTest(args=args, state="unreadable guard"):
                self.installed_guard.chmod(0)
                self.assert_no_effect(self.call(*args, script=wrapper))
                self.installed_guard.chmod(0o644)
            with self.subTest(args=args, state="allowed"):
                result = self.call(*args, script=wrapper)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.log.read_text(), "compose " + " ".join(args) + "\n")
                self.log.unlink()

    def test_compose_non_launch_commands_work_while_held(self):
        wrapper = HERE / "x-launch-docker-compose.sh"
        self.assertEqual(self.call("init").returncode, 0)
        for args in (("config",), ("pull",), ("down",)):
            with self.subTest(args=args):
                result = self.call(*args, script=wrapper)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.log.read_text(), "compose " + " ".join(args) + "\n")
                self.log.unlink()

    def test_hold_waits_for_admitted_command_and_denies_next(self):
        self.init_allow()
        started = self.root / "started"
        blocker = self.root / "blocker"
        blocker.write_text("#!/bin/sh\ntouch \"$STARTED\"\nsleep 0.4\n")
        blocker.chmod(0o755)
        env = dict(self.env, STARTED=str(started))
        launch = subprocess.Popen(["python3", str(GUARD), "run", str(blocker)], env=env)
        try:
            for _ in range(100):
                if started.exists():
                    break
                time.sleep(0.01)
            self.assertTrue(started.exists())
            hold = subprocess.Popen(["python3", str(GUARD), "hold"], env=env,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            time.sleep(0.08)
            self.assertIsNone(hold.poll())
            self.assertEqual(launch.wait(timeout=3), 0)
            _, hold_error = hold.communicate(timeout=3)
            self.assertEqual(hold.returncode, 0, hold_error.decode())
            self.log.unlink()
            self.assert_no_effect(self.call("run", str(self.fake), "provider"))
        finally:
            if launch.poll() is None:
                launch.kill()

    def test_host_run_can_start_nested_container_entrypoint(self):
        self.init_allow()
        program = ("import pathlib, runpy, sys; "
                   "guard=runpy.run_path(sys.argv[1])['main']; "
                   "guard.__globals__['CONTAINER_STATE']=pathlib.Path(sys.argv[2]); "
                   "sys.exit(guard(['container-exec',sys.argv[3],'nested']))")
        result = subprocess.run(
            ["python3", str(GUARD), "run", "python3", "-c", program,
             str(GUARD), str(self.state), str(self.fake)],
            env=self.env, capture_output=True, text=True, timeout=3)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.log.read_text(), "nested\n")
        self.log.unlink()
        self.assertEqual(self.call("hold").returncode, 0)
        self.log.unlink()
        denied = subprocess.run(
            ["python3", str(GUARD), "run", "python3", "-c", program,
             str(GUARD), str(self.state), str(self.fake)],
            env=self.env, capture_output=True, text=True, timeout=3)
        self.assert_no_effect(denied)

    def test_queued_hold_cannot_deadlock_nested_entrypoint(self):
        self.init_allow()
        ready = self.root / "outer-ready"
        release = self.root / "release-child"
        nested = self.root / "nested.py"
        nested.write_text(
            "import pathlib, runpy, sys, time\n"
            "pathlib.Path(sys.argv[3]).touch()\n"
            "while not pathlib.Path(sys.argv[4]).exists(): time.sleep(0.01)\n"
            "guard = runpy.run_path(sys.argv[1])['main']\n"
            "guard.__globals__['CONTAINER_STATE'] = pathlib.Path(sys.argv[2])\n"
            "sys.exit(guard(['container-exec', sys.argv[5], 'nested']))\n")
        outer = subprocess.Popen(
            ["python3", str(GUARD), "run", "python3", str(nested),
             str(GUARD), str(self.state), str(ready), str(release), str(self.fake)],
            env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        hold = None
        try:
            for _ in range(100):
                if ready.exists():
                    break
                time.sleep(0.01)
            self.assertTrue(ready.exists())
            hold = subprocess.Popen(["python3", str(GUARD), "hold"], env=self.env,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            time.sleep(0.05)
            self.assertIsNone(hold.poll())
            release.touch()
            outer.communicate(timeout=3)
            _, hold_error = hold.communicate(timeout=3)
            self.assertEqual(hold.returncode, 0, hold_error.decode())
            self.assertIn("phase=held", (self.state / "x-launch-state.v1").read_text())
        finally:
            release.touch()
            for process in (outer, hold):
                if process is not None and process.poll() is None:
                    process.kill()
                    process.communicate()

    def test_containerd_fallback_uses_reviewed_guard_explicitly(self):
        self.init_allow()
        (self.root / "runtime").mkdir()
        ctr_log = self.root / "ctr-args"
        ctr = self.root / "fake-ctr"
        ctr.write_text(
            "#!/bin/sh\n"
            "case \"$*\" in\n"
            "  '-n moby tasks ls') printf 'TASK PID STATUS\\n' ;;\n"
            "  '-n moby containers info '*) exit 1 ;;\n"
            "  '-n moby run '*) printf '%s\\n' \"$@\" > \"$CTR_LOG\"; exit 42 ;;\n"
            "  *) exit 43 ;;\n"
            "esac\n")
        ctr.chmod(0o755)
        docker = self.root / "fake-docker-inspect"
        docker.write_text(
            "#!/bin/sh\n"
            "[ \"$*\" = 'inspect social-monitor-prod-x-collector-1' ] || exit 44\n"
            "printf '%s\\n' '[{\"Config\":{\"Env\":[\"FIXTURE_MODE=1\",\"X_COLLECTOR_GRPC_BIND=127.0.0.1:50051\"]}}]'\n")
        docker.chmod(0o755)
        systemctl = self.root / "fake-systemctl-inactive"
        systemctl.write_text("#!/bin/sh\nexit 1\n")
        systemctl.chmod(0o755)
        env = dict(self.env, CTR_LOG=str(ctr_log), SOCIAL_MONITOR_X_LAUNCH_TEST_CTR=str(ctr),
                   SOCIAL_MONITOR_X_LAUNCH_TEST_DOCKER=str(docker),
                   SOCIAL_MONITOR_X_LAUNCH_TEST_SYSTEMCTL=str(systemctl))
        result = self.call("run", script=HERE / "rolling-containerd-fallback.sh", env=env)
        self.assertEqual(result.returncode, 42, result.stderr)
        args = ctr_log.read_text().splitlines()
        self.assertIn("type=bind,src=" + str(self.state) +
                      ",dst=/run/social-monitor-x-launch-state,options=rbind:ro", args)
        self.assertIn("type=bind,src=" + str(self.installed_guard) +
                      ",dst=/run/social-monitor-x-launch-guard.py,options=rbind:ro", args)
        self.assertEqual(args[-7:], ["social-monitor-x-host-fallback", "python",
                                     "/run/social-monitor-x-launch-guard.py", "container-exec",
                                     "python", "-m", "x_collector"])
        fallback = (HERE / "rolling-containerd-fallback.sh").read_text()
        self.assertIn('src="$ROOT/control/deploy-state",dst=/run/social-monitor-x-launch-state,options=rbind:ro', fallback)
        self.assertIn('src="$X_LAUNCH_GUARD",dst=/run/social-monitor-x-launch-guard.py,options=rbind:ro', fallback)
        self.assertIn('python /run/social-monitor-x-launch-guard.py container-exec python -m x_collector', fallback)

    def test_container_entrypoint_checks_same_durable_state(self):
        self.init_allow()
        program = ("import importlib.machinery, pathlib, sys; "
                   "m=importlib.machinery.SourceFileLoader('guard',sys.argv[1]).load_module(); "
                   "m.CONTAINER_STATE=pathlib.Path(sys.argv[2]); "
                   "sys.exit(m.main(['container-exec',sys.argv[3],'provider']))")
        command = ["python3", "-c", program, str(GUARD), str(self.state), str(self.fake)]
        self.assertEqual(subprocess.run(command, env=self.env).returncode, 0)
        self.log.unlink()
        self.assertEqual(self.call("hold").returncode, 0)
        self.log.unlink()
        self.assertNotEqual(subprocess.run(command, env=self.env, capture_output=True).returncode, 0)
        self.assertFalse(self.log.exists())

    def test_failed_owner_inventory_leaves_durable_hold(self):
        self.init_allow()
        failed = self.root / "failed-inventory"
        failed.write_text("#!/bin/sh\nexit 19\n")
        failed.chmod(0o755)
        env = dict(self.env, SOCIAL_MONITOR_X_LAUNCH_TEST_DOCKER=str(failed))
        self.assertNotEqual(self.call("hold", env=env).returncode, 0)
        self.assertIn("phase=held", (self.state / "x-launch-state.v1").read_text())
        self.assert_no_effect(self.call("run", str(self.fake), "provider"))

    def test_runtime_release_packages_guard_and_wrappers(self):
        staged = self.root / "staged-release"
        staged.mkdir()
        shell = ("source \"$1\"; "
                 "postgres_runtime_stage_reader_summary_assets \"$2\" \"$3\"")
        result = subprocess.run(
            ["bash", "-c", shell, "_", str(HERE.parent / "postgres-runtime-asset-lib.sh"),
             str(HERE), str(staged)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for name, mode in (("x-launch-guard.py", 0o644),
                           ("compose.x-launch-guard.yml", 0o644),
                           ("x-launch-docker-compose.sh", 0o755),
                           ("x-launch-docker-up.sh", 0o755)):
            target = staged / name
            self.assertEqual(target.read_bytes(), (HERE / name).read_bytes())
            self.assertEqual(target.stat().st_mode & 0o777, mode)

    def test_deploy_scope_requires_persistent_x_guard_mounts(self):
        checker = HERE.parent / "production-compose-scope-check.py"
        images = {
            "caddy": "caddy:2.11.4-alpine", "frontend": "nginx:1.29-alpine",
            "otel-collector": "otel/opentelemetry-collector-contrib:0.157.0@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6",
            "rabbitmq": "rabbitmq:4.3-management", "redis": "redis:8-alpine",
        }
        names = ("agent-runtime", "api", "caddy", "daily-runner", "delivery-service",
                 "event-relay", "frontend", "ingestion-worker", "intelligence-worker",
                 "migrate", "otel-collector", "rabbitmq", "redis", "x-collector")
        services = {}
        for name in names:
            service = {"networks": {"default": None}}
            if name in images:
                service["image"] = images[name]
            else:
                dockerfile = (str(self.root / "control" / f"{name}.Dockerfile")
                              if name in {"daily-runner", "x-collector"} else "Dockerfile")
                service["build"] = {"context": str(self.root), "dockerfile": dockerfile}
            services[name] = service
        services["agent-runtime"]["environment"] = {
            "AGENT_RUNTIME_PROVIDER": "codex", "AGENT_RUNTIME_MODEL": "gpt-5.6-sol",
            "AGENT_RUNTIME_REASONING_EFFORT": "high"}
        services["daily-runner"]["environment"] = {
            "READER_SUMMARY_MODEL_PROVIDER": "agent-runtime",
            "AGENT_RUNTIME_READER_SUMMARY_MODEL": "gpt-5.6-sol",
            "AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT": "high"}
        services["api"]["ports"] = [{"host_ip": "127.0.0.1", "published": "13000", "target": 3000}]
        services["frontend"]["ports"] = [{"host_ip": "127.0.0.1", "published": "13080", "target": 80}]
        services["caddy"]["ports"] = [
            {"published": "80", "target": 80}, {"published": "443", "target": 443},
            {"published": "443", "target": 443, "protocol": "udp"}]
        x = services["x-collector"]
        x["restart"] = "no"
        x["entrypoint"] = ["python", "/run/social-monitor-x-launch-guard.py", "container-exec"]
        x["command"] = ["python", "-m", "x_collector"]
        x["volumes"] = [
            {"type": "bind", "source": str(self.state),
             "target": "/run/social-monitor-x-launch-state", "read_only": True},
            {"type": "bind", "source": str(self.installed_guard),
             "target": "/run/social-monitor-x-launch-guard.py", "read_only": True}]
        rendered = self.root / "rendered-compose.json"
        config = {"services": services, "networks": {"default": {}},
                  "volumes": {"rabbitmq-data": {}, "redis-data": {}}}
        command = ["python3", str(checker), str(rendered), str(self.root),
                   str(self.root), str(self.root / "control")]
        accepted_config = json.dumps(config)
        rendered.write_text(accepted_config)
        accepted = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        for change in (lambda: x["volumes"].pop(),
                       lambda: x.update(restart="always"),
                       lambda: x.update(entrypoint=["python", "-m", "x_collector"])):
            change()
            rendered.write_text(json.dumps(config))
            denied = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(denied.returncode, 0)
            self.assertIn("X launch guard mount or restart policy is invalid", denied.stderr)
            config = json.loads(accepted_config)
            x = config["services"]["x-collector"]

    def test_hold_stops_both_exact_managed_owners(self):
        self.init_allow()
        docker_active = self.root / "docker-active"
        ctr_active = self.root / "ctr-active"
        docker_active.touch()
        ctr_active.touch()
        owner = self.root / "fake-owner"
        owner.write_text(
            "#!/bin/sh\n"
            f"case \"$*\" in\n"
            f"  'ps -aq --filter name=^/social-monitor-prod-x-collector-1$') "
            f"[ ! -e '{docker_active}' ] || printf 'fixture-id\\n' ;;\n"
            f"  'ps -q --filter name=^/social-monitor-prod-x-collector-1$') "
            f"[ ! -e '{docker_active}' ] || printf 'fixture-id\\n' ;;\n"
            f"  'stop -t 10 social-monitor-prod-x-collector-1') rm -f '{docker_active}' ;;\n"
            f"  '-n moby tasks ls') printf 'TASK PID STATUS\\n'; "
            f"[ ! -e '{ctr_active}' ] || printf 'social-monitor-x-host-fallback 1 RUNNING\\n' ;;\n"
            f"  '-n moby tasks kill --signal SIGKILL social-monitor-x-host-fallback') "
            f"rm -f '{ctr_active}' ;;\n"
            "  *) exit 99 ;;\n"
            "esac\n")
        owner.chmod(0o755)
        env = dict(self.env, SOCIAL_MONITOR_X_LAUNCH_TEST_DOCKER=str(owner),
                   SOCIAL_MONITOR_X_LAUNCH_TEST_CTR=str(owner))
        result = self.call("hold", env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(docker_active.exists())
        self.assertFalse(ctr_active.exists())


if __name__ == "__main__":
    unittest.main()
