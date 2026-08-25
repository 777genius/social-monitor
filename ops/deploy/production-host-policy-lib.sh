#!/usr/bin/env bash

# Focused host policy shared by the installed deploy entrypoint and the
# authenticated production control-bridge bootstrap.
production_deploy_source_library() {
  local relative_path=$1 label=$2
  if [[ ${PRODUCTION_CONTROL_BRIDGE_TRUSTED_SOURCE:-} == 1 ]]; then
    production_control_bridge_source_reviewed "$relative_path" "$label"
  else
    # shellcheck source=/dev/null
    source "$REPO/$relative_path"
  fi
}

verify_production_deploy_host_policy() {
  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] && return 0
  ((EUID == 0)) || fail 'production deploy must run as root'
  [[ -f $CONTROL/github-production-deploy.sh && \
     ! -L $CONTROL/github-production-deploy.sh && \
     $(stat -c '%U:%G:%a' "$CONTROL/github-production-deploy.sh") == root:root:755 ]] || \
    fail 'root deploy entrypoint ownership or mode is invalid'
  [[ -f $CONTROL/github-production-deploy-wrapper.sh && \
     ! -L $CONTROL/github-production-deploy-wrapper.sh && \
     $(stat -c '%U:%G:%a' "$CONTROL/github-production-deploy-wrapper.sh") == root:root:755 ]] || \
    fail 'SSH deploy wrapper ownership or mode is invalid'
  if id -nG social-monitor-deploy | tr ' ' '\n' | grep -qx docker; then
    fail 'deploy user must not belong to the docker group'
  fi
  local sudoers=/etc/sudoers.d/social-monitor-deploy sudo_commands ssh_policy
  [[ -f $sudoers && ! -L $sudoers && \
     $(stat -c '%U:%G:%a' "$sudoers") == root:root:440 ]] || \
    fail 'deploy sudoers ownership or mode is invalid'
  [[ $(cat "$sudoers") == 'social-monitor-deploy ALL=(root) NOPASSWD: /var/data/social-monitor/control/github-production-deploy.sh *' ]] || \
    fail 'deploy sudoers content is not project-scoped'
  visudo -cf "$sudoers" >/dev/null || fail 'deploy sudoers policy is invalid'
  sudo_commands=$(LC_ALL=C sudo -l -U social-monitor-deploy | \
    sed -n '/may run the following commands/,$p' | tail -n +2 | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//')
  [[ $sudo_commands == '(root) NOPASSWD: /var/data/social-monitor/control/github-production-deploy.sh *' ]] || \
    fail 'deploy user has unexpected sudo authority'
  ssh_policy=$(sshd -T -C user=social-monitor-deploy,host=localhost,addr=127.0.0.1)
  for expectation in \
    'passwordauthentication no' 'kbdinteractiveauthentication no' \
    'disableforwarding yes' 'allowagentforwarding no' \
    'allowtcpforwarding no' 'x11forwarding no' 'permittty no' \
    'forcecommand /var/data/social-monitor/control/github-production-deploy-wrapper.sh'; do
    grep -Fx "$expectation" <<< "$ssh_policy" >/dev/null || \
      fail "missing SSH policy: $expectation"
  done
}
