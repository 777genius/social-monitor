# 265 - Secret Scanning Leak Response

## Decision

Enable secret scanning and push protection for repositories where available.

Secret leaks are treated as security incidents with immediate revocation, not as simple git cleanup tasks.

## Sources

- GitHub secret scanning: https://docs.github.com/en/code-security/secret-scanning
- Enabling GitHub secret scanning and push protection: https://docs.github.com/en/code-security/secret-scanning/enabling-secret-scanning-features
- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

## Prevention

Required:

- GitHub secret scanning
- push protection where available
- pre-commit secret scan optional but recommended
- `.env.example` without real secrets
- no production secrets in local docs
- CI checks for common secret patterns

## What Counts As A Secret

Secrets include:

- provider API keys
- OAuth client secrets
- refresh tokens
- JWT signing keys
- database URLs with credentials
- webhook signing secrets
- cloud credentials
- private keys
- container signing keys
- mobile signing credentials

## Leak Response

If a secret is committed:

1. revoke/rotate the credential immediately
2. identify scope and exposure window
3. check logs/provider audit for misuse
4. remove or rewrite history only after revocation
5. open incident record
6. add detection/prevention control
7. notify affected parties if required

Deleting the commit is not enough.

## Push Protection Bypass

Bypass requires:

- explicit reason
- security owner review where possible
- follow-up validation

Repeated bypasses are treated as process failure.

## CI Secrets

CI secrets must be:

- environment scoped
- least privilege
- rotated
- unavailable to untrusted forks
- masked in logs
- replaced by OIDC where possible

## Logs And Artifacts

Build logs and artifacts must be scanned or reviewed for accidental secret exposure.

Do not upload:

- `.env`
- provider config with real tokens
- mobile signing files
- kubeconfig with production access

## Architecture Rule

A leaked secret is assumed compromised.

The first fix is revocation, not hiding evidence.
