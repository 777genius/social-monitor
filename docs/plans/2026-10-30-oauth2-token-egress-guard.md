# OAuth2 source-credential token egress guard

## Confirmed risk

`OAuth2SourceCredentialRefresher.refreshIfNeeded` accepts a tenant-supplied
`tokenUrl` from encrypted source credentials. The current hostname/protocol
validator runs before `fetch`, but `fetch` performs its own DNS lookup and
follows HTTP redirects. A public hostname that resolves to an internal address,
or a 307/308 redirect to a private service, could expose refresh credentials
or invoke internal endpoints. URL-only validation does not establish socket
destination authority.

## Minimal implementation

- Implement a focused HTTPS token POST transport adapter using the existing
  `createGuardedDnsLookup` contract from platform-http. Validate HTTPS,
  reject private/mixed DNS answers in the actual socket lookup, pin the peer,
  require `rejectUnauthorized: true` and `socket.authorized === true`,
  and **never follow redirects**.
- Bound total request time and token response size (64 KiB); terminate when
  the cap is exceeded, preserving existing sanitized error behavior.
- Keep the refresher in charge of OAuth2 token parsing, expiry and credential
  rotation. Introduce only a narrow injectable HTTP port to isolate transport
  from domain/application logic.
- The existing local HTTP smoke fixture must inject an explicit fixture-only
  client; never bypass these checks in production because a test uses HTTP.

## Review and validation

- Negative: loopback literal, mixed DNS response, public-DNS private rebinding,
  certificate not authorized, redirect response and overlarge body all reject,
  with no refresh token sent to an unsafe socket.
- Positive: ordinary HTTPS token response still updates access/refresh token,
  expiry and scopes without exposing secrets in error strings.
- Run focused Jest, source-credential lifecycle smoke, TypeScript, architecture,
  security and full PR CI. Obtain independent security review before merging.

## Rollout

This is a stacked PR on the architecture/reliability branch (#588) because it
reuses its shared guarded DNS/socket adapter. No new public API or database
migration. A tenant-configured HTTP token URL is already rejected by policy;
local smoke must explicitly opt into its fixture client only. No production
deployment is authorized by this plan.
