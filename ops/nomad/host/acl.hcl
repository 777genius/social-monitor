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
  # No `policy` shorthand here on purpose: Nomad merges a namespace block's
  # `policy` shorthand into the same capabilities list as any explicit
  # `capabilities` entries, and "deny" itself expands to a "deny" capability
  # that takes precedence over every other capability once merged in. Adding
  # `policy = "deny"` alongside the explicit list below would silently deny
  # everything in this namespace regardless of the capabilities named here -
  # the explicit list is already the complete, minimal grant; it does not
  # need (and must not get) a coarse-grained policy shorthand layered on top.
  capabilities = [
    "submit-job",
    "read-job",
    "list-jobs",
    "read-logs",
  ]
  # No "dispatch-job": sm-api is not (and is not planned to become) a
  # parameterized job. Granting it now would let this token dispatch any
  # future parameterized job in this namespace without a deliberate policy
  # review at the time that job is actually added - least privilege means
  # adding this back only when a real dispatch consumer exists.
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
