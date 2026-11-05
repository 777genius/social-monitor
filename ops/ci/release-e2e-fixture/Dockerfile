# Build only in the integration lane. FIXTURE_BASE is an independently reviewed
# digest-pinned tool image, already containing all fixed native dependencies.
# No latest tag, network install, fabricated digest or silent dependency fallback.
ARG FIXTURE_BASE
FROM ${FIXTURE_BASE}
ARG FIXTURE_BASE
USER root
COPY --chown=0:0 --chmod=0644 ops/release/hetzner/controller.py ops/release/hetzner/contract.py ops/release/hetzner/archive.py ops/release/hetzner/bounds.py ops/release/hetzner/evidence.py ops/release/hetzner/prisma_history.py ops/release/hetzner/host.py ops/release/hetzner/compose_contract.py ops/release/hetzner/requirements.txt /opt/social-monitor-release/
COPY --chown=0:0 --chmod=0755 ops/release/hetzner/release-gate.sh /opt/social-monitor-release/release-gate.sh
# Canonical unchanged source; compile normally with install.py's exact flags.
COPY --chown=0:0 --chmod=0644 ops/release/hetzner/operator_adapter.py ops/release/hetzner/operator_config.py ops/release/hetzner/operator_github.py ops/release/hetzner/operator_backup.py ops/release/hetzner/operator_database.py ops/release/hetzner/operator_probe.py ops/release/hetzner/restricted-executor.c ops/release/hetzner/install.py /opt/social-monitor-release/
COPY --chown=0:0 --chmod=0644 build-inputs/toolchain.json /opt/social-monitor-release-e2e/toolchain.json
COPY --chown=0:0 --chmod=0644 ops/ci/release-e2e-native.py /opt/social-monitor-release-e2e/release-e2e-native.py
COPY --chown=0:0 --chmod=0755 ops/ci/release-e2e-fixture/operator.py /opt/social-monitor-release-e2e/operator.py
COPY --chown=0:0 --chmod=0755 ops/ci/release-e2e-fixture/entrypoint.sh /opt/social-monitor-release-e2e/entrypoint.sh
RUN /usr/bin/gcc -static -O2 -Wall -Wextra -Werror -o /opt/social-monitor-release/restricted-executor /opt/social-monitor-release/restricted-executor.c \
    && chmod 0755 /opt/social-monitor-release/restricted-executor /opt/social-monitor-release \
    && install -o root -g root -m 0700 /opt/social-monitor-release/restricted-executor /opt/social-monitor-release/root-executor \
    && /opt/social-monitor-release-python/bin/python3 -I -B -c 'import json,sys; assert json.load(open("/opt/social-monitor-release-e2e/toolchain.json"))["base_image"] == sys.argv[1]' "$FIXTURE_BASE" \
    && /opt/social-monitor-release-python/bin/python3 -I -B /opt/social-monitor-release-e2e/operator.py verify-toolchain </dev/null \
    && useradd --create-home --shell /opt/social-monitor-release/restricted-executor e2e \
    && passwd -d e2e \
    && mkdir -p /run/sm-release-consumer \
    && ln -s /run/sm-release-consumer/docker.sock /var/run/docker.sock
ENTRYPOINT ["/opt/social-monitor-release-e2e/entrypoint.sh"]
