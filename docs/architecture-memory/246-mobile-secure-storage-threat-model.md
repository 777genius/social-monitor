# 246 - Mobile Secure Storage Threat Model

## Decision

Flutter stores only high-value small secrets in platform secure storage.

Use iOS Keychain and Android Keystore-backed storage for refresh/session secrets, but do not treat client storage as a place for provider credentials or long-term product truth.

## Sources

- Apple Keychain Services: https://developer.apple.com/documentation/security/keychain-services
- Apple Keychain data protection: https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web
- Android Keystore system: https://developer.android.com/privacy-and-security/keystore
- OWASP Mobile Application Security: https://mas.owasp.org/
- OWASP MASVS storage controls: https://mas.owasp.org/MASVS/controls/MASVS-STORAGE/

## Store In Secure Storage

Allowed:

- refresh token/session secret
- device-bound session id
- local encryption key wrapper
- last selected tenant id if non-sensitive
- biometric unlock preference metadata

Avoid:

- raw access tokens if they can be kept in memory
- provider OAuth tokens for Reddit/X/Telegram
- source credentials
- API keys
- raw posts
- summaries containing sensitive tenant data
- audit data

Provider credentials live on backend only.

## Platform Reality

Keychain/Keystore protect keys and small secrets better than plain preferences, but a compromised device, rooted/jailbroken environment or malicious instrumentation can still attack the app process.

Therefore:

- server-side revocation remains mandatory
- access tokens stay short-lived
- refresh tokens rotate
- sensitive actions require backend authorization
- device trust is a signal, not proof

## Flutter Boundary

Feature code uses:

```text
SecureSecretStorePort
```

Infrastructure adapter uses the selected secure storage plugin/native bridge.

Domain and presentation stores do not import storage plugin APIs.

## Plain Preferences

Use plain preferences only for:

- theme
- locale
- UI layout choices
- non-sensitive last-opened screen
- feature education flags

Never store secrets in shared preferences/plain local storage.

## Logout

Logout must:

- revoke server session where possible
- clear refresh/session secret
- clear access token memory
- clear tenant-scoped offline cache if tenant policy requires
- disconnect WebSocket
- unregister or detach push token if needed

## Reinstall And Backup Caveat

Keychain/backup behavior differs by platform and configuration.

The app must tolerate:

- secure item unavailable while device locked
- secure item surviving reinstall on some platforms/configurations
- secure item missing after backup/restore
- biometric enrollment changes invalidating access

## Testing

Required:

- token cleared on logout
- expired refresh returns to login
- missing secure storage entry handled
- wrong flavor cannot reuse production tokens
- no token in logs/crash reports
- storage adapter mocked in store tests

## Architecture Rule

Secure storage reduces exposure. It does not replace backend session control.
