# Nomad jobspec for the `sm-api` vertical slice (plan sections 4 and 7).
# Submitted only by the host-owned release transaction in
# `ops/nomad/release.mjs` via `host/api-deploy.service` - never applied
# directly with the bare `nomad` CLI in production. `nomad job plan` against
# this file must be run with `-check-index` semantics before every submit.
#
# No `network` stanza on the group: this task joins the existing project
# Docker network directly via the driver's own `network_mode` (plan section
# 4), and the plan is explicit that Nomad-managed `network.mode = "bridge"`
# (CNI) must never be combined with that - so this jobspec intentionally
# declares neither.
#
# NOTE: `nomad fmt`/`nomad job validate` were not run against this file -
# the `nomad` CLI is not available in this environment. It has only been
# reviewed manually against the HCL2 job specification docs referenced in
# the plan. Run both before the first real submit.

variable "image" {
  type        = string
  description = "Immutable digest reference, e.g. ghcr.io/777genius/social-monitor-api@sha256:..."
}

variable "release_sha" {
  type        = string
  description = "Full 40-hex source commit SHA this image was built from."
}

variable "network_mode" {
  type        = string
  description = "Existing project Docker network name, passed straight to the Docker driver's network_mode (from preflight inventory)."
}

job "sm-api" {
  region      = "global"
  datacenters = ["dc1"]
  namespace   = "social-monitor"
  type        = "service"

  update {
    max_parallel      = 1
    canary            = 1
    min_healthy_time  = "30s"
    healthy_deadline  = "5m"
    progress_deadline = "10m"
    auto_revert       = true
    auto_promote      = false
    health_check      = "checks"
  }

  group "api" {
    count = 1

    volume "api-secrets" {
      type      = "host"
      source    = "social-monitor-api-secrets"
      read_only = true
    }

    task "api" {
      driver = "docker"

      volume_mount {
        volume      = "api-secrets"
        destination = "/var/run/social-monitor/secrets/nomad/api.env.d"
        read_only   = true
      }

      config {
        image        = var.image
        network_mode = var.network_mode
        # No privileged/raw_exec-equivalent flags, no extra host mounts, no
        # host PID/IPC (plan section 5). The entrypoint baked into the image
        # (ops/nomad/api-env-entrypoint.mjs) reads its env file from the
        # read-only volume mounted above before exec'ing the real process.
      }

      env {
        NODE_ENV = "production"
        SERVICE  = "api"
        # Overrides the image's baked-in default (ops/nomad/api.Dockerfile),
        # which points at a local-testing path that does not exist inside
        # this task: the actual secret lives inside the read-only volume
        # mounted above, materialized by the host bootstrap as
        # <api-secrets volume>/api.env (plan section 6).
        SOCIAL_MONITOR_API_ENV_FILE = "/var/run/social-monitor/secrets/nomad/api.env.d/api.env"
      }

      # address_mode = "driver" resolves the container's own IP on the
      # existing project network (assigned above via network_mode), so no
      # Nomad-declared port label or new host port is needed - port 3000 is
      # the container's own EXPOSE'd port from ops/nomad/api.Dockerfile.
      service {
        name         = "sm-api"
        port         = "3000"
        provider     = "nomad"
        address_mode = "driver"

        check {
          type     = "http"
          path     = "/ready"
          interval = "10s"
          timeout  = "5s"
        }
      }

      resources {
        cpu    = 500
        memory = 512
      }

      kill_timeout   = "45s"
      shutdown_delay = "10s"

      meta {
        release_sha = var.release_sha
      }
    }
  }
}
