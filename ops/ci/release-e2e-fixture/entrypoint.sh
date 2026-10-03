#!/bin/sh
set -eu
# These paths exist only inside the disposable SSH fixture. Never source inputs.
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
fixture_python=/opt/social-monitor-release-python/bin/python3
fixture_operator=/opt/social-monitor-release-e2e/operator.py
"$fixture_python" -I -B "$fixture_operator" verify-toolchain </dev/null >/dev/null
test "$(id -u)" = 0
test -d /srv/fixture
test -S /run/sm-release-consumer/docker.sock
test -f /srv/fixture/authorized.pub
test -f /srv/fixture/ssh_host_ed25519_key
# Root copies only the driver's finite trusted setup files, never candidate code.
mkdir -p /etc/social-monitor/release /etc/pgbackrest /run/sshd /var/lib/pgbackrest
chown 999:999 /var/lib/pgbackrest
chmod 0750 /var/lib/pgbackrest
chown 0:0 /srv/fixture
chmod 0700 /srv/fixture
chmod 0600 /srv/fixture/authority.json /srv/fixture/consumer.json /srv/fixture/toolchain.json /srv/fixture/compose.json /srv/fixture/metadata.env
install -o root -g root -m 0644 /srv/fixture/backup.conf /etc/pgbackrest/e2e.conf
install -o root -g root -m 0600 /srv/fixture/ssh_host_ed25519_key /etc/ssh/ssh_host_ed25519_key
# Machine identity is the controller's literal authorized ID in this container only.
printf '%s\n' b28fc7b17042414386eb9b114046e50c >/etc/machine-id
chmod 0644 /etc/machine-id
cat >/usr/local/sbin/pgbackrest-with-cipher-pass <<'WRAPPER'
#!/bin/sh
exec /usr/bin/setpriv --reuid=999 --regid=999 --clear-groups /usr/bin/pgbackrest "$@"
WRAPPER
chmod 0755 /usr/local/sbin/pgbackrest-with-cipher-pass
cat >/etc/social-monitor/release/operator-adapter <<'ADAPTER'
#!/bin/sh
exec /opt/social-monitor-release-python/bin/python3 -I -B /opt/social-monitor-release-e2e/operator.py "$@"
ADAPTER
chmod 0755 /etc/social-monitor/release/operator-adapter
cat >/usr/bin/systemctl <<'FENCE'
#!/bin/sh
exec /opt/social-monitor-release-python/bin/python3 -I -B /opt/social-monitor-release-e2e/operator.py systemctl "$@"
FENCE
chmod 0755 /usr/bin/systemctl
# Non-setuid canonical C grammar, real sudo and no-argument root copy.
test "$(getent passwd e2e | cut -d: -f7)" = /opt/social-monitor-release/restricted-executor
cat >/etc/sudoers.d/sm-release-e2e <<'SUDOERS'
Defaults:e2e env_reset,!setenv
Defaults:e2e env_keep += "SSH_ORIGINAL_COMMAND"
e2e ALL=(root) NOPASSWD: /opt/social-monitor-release/root-executor ""
SUDOERS
chmod 0440 /etc/sudoers.d/sm-release-e2e
/usr/sbin/visudo -cf /etc/sudoers.d/sm-release-e2e >/dev/null
mkdir -p /home/e2e/.ssh
fixture_public_key=$(cat /srv/fixture/authorized.pub)
case "$fixture_public_key" in ssh-ed25519\ *) ;; *) exit 1 ;; esac
printf 'restrict,command="/usr/bin/sudo -n /opt/social-monitor-release/root-executor" %s\n' "$fixture_public_key" >/home/e2e/.ssh/authorized_keys
chown -R root:root /home/e2e
chmod 0755 /home/e2e
chmod 0755 /home/e2e/.ssh
chmod 0644 /home/e2e/.ssh/authorized_keys
cat >/etc/ssh/sshd_config <<'SSHD'
Port 22
ListenAddress 0.0.0.0
HostKey /etc/ssh/ssh_host_ed25519_key
PidFile /run/sshd.pid
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
UsePAM yes
StrictModes yes
AllowUsers e2e
AuthorizedKeysFile /home/e2e/.ssh/authorized_keys
PermitUserEnvironment no
PermitUserRC no
AllowTcpForwarding no
AllowAgentForwarding no
X11Forwarding no
PermitTunnel no
PermitTTY no
ForceCommand /usr/bin/sudo -n /opt/social-monitor-release/root-executor
LogLevel ERROR
SSHD
/usr/sbin/sshd -t -f /etc/ssh/sshd_config
touch /run/social-monitor-release-e2e-ready
chmod 0600 /run/social-monitor-release-e2e-ready
exec /usr/bin/env -i PATH="$PATH" LC_ALL=C /usr/sbin/sshd -D -e -f /etc/ssh/sshd_config
