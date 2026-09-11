# Single server+client Nomad agent for the API vertical slice MVP (plan
# section 5). Not dev mode: ACL and mTLS are enabled, and only the loopback
# HTTP API is reachable from this host. `bootstrap_expect = 1` is a
# deliberate single-VPS limitation (no host-level HA); see the plan's
# section 1 for the explicit trade-off this accepts.
#
# Pin: ops/nomad/versions.json records the exact verified binary
# version/checksum this config is meant to run.

data_dir  = "/var/lib/nomad"
log_level = "INFO"
name      = "social-monitor-vps"
region    = "global"
datacenter = "dc1"

# Loopback only: nothing outside this host can reach the Nomad API, RPC, or
# gossip ports. The restricted deploy wrapper is the only external caller,
# and it runs on the same host via SSH.
bind_addr = "127.0.0.1"

advertise {
  http = "127.0.0.1"
  rpc  = "127.0.0.1"
  serf = "127.0.0.1"
}

ports {
  http = 4646
  rpc  = 4647
  serf = 4648
}

server {
  enabled          = true
  bootstrap_expect = 1
}

client {
  enabled = true

  # No arbitrary host mounts: only the named volume the API entrypoint reads
  # its env file from is allowed, and it is read-only.
  host_volume "social-monitor-api-secrets" {
    path      = "/var/data/social-monitor/secrets/nomad/api.env.d"
    read_only = true
  }
}

acl {
  enabled = true
}

tls {
  http = true
  rpc  = true

  ca_file   = "/var/data/social-monitor/secrets/nomad/tls/ca.pem"
  cert_file = "/var/data/social-monitor/secrets/nomad/tls/agent.pem"
  key_file  = "/var/data/social-monitor/secrets/nomad/tls/agent-key.pem"

  verify_server_hostname = true
  verify_https_client    = true
}

plugin "docker" {
  config {
    # No privileged containers, no raw_exec-equivalent capability escape,
    # and no host PID/IPC sharing: the API task only needs its own network
    # namespace on the existing project Docker network (plan section 4).
    allow_privileged        = false
    allow_caps              = ["CHOWN", "SETUID", "SETGID"]
    volumes {
      enabled = true
    }
  }
}
