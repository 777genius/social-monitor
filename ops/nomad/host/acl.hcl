# Minimal deploy ACL policy for the `sm-api` job (plan section 5). Bound to
# namespace "social-monitor" only: no management capability, no access to
# any other namespace or global Nomad state. The CI-facing restricted
# wrapper authenticates with a token tied to this policy, never the
# bootstrap management token.
#
# The nginx traffic-reconciliation adapter (plan section 4) needs its own,
# separate, strictly read-only policy ("read-job"/"list-jobs" only, no
# submit-job/dispatch-job). That adapter does not exist until the rollout PR
# ships its `ops/nomad/adapters/nginx.mjs`, so its policy file is added then
# rather than being a second, unused namespace stanza here.

namespace "social-monitor" {
  policy = "deny"

  capabilities = [
    "submit-job",
    "read-job",
    "list-jobs",
    "read-logs",
    "dispatch-job",
  ]
}

agent {
  policy = "deny"
}

node {
  policy = "deny"
}

operator {
  policy = "deny"
}

quota {
  policy = "deny"
}
