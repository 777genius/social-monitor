#!/bin/bash
set -euo pipefail
# Installed, root-owned code; never resolve code or configuration from a candidate.
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
exec /usr/bin/env -i PATH="$PATH" LC_ALL=C \
  SSH_ORIGINAL_COMMAND="${SSH_ORIGINAL_COMMAND-}" \
  /opt/social-monitor-release-python/bin/python3 -I -B /opt/social-monitor-release/controller.py
