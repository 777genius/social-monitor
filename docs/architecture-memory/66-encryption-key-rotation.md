# Encryption & Key Rotation

Date: 2026-05-31
Status: baseline encryption memory

## Decision

Use envelope encryption for sensitive application-level secrets and payload classes that need explicit key governance.

Cloud/provider storage encryption is necessary but not sufficient for connector credentials and high-risk secrets.

References:

- Google Cloud KMS Envelope Encryption: https://cloud.google.com/kms/docs/envelope-encryption
- AWS KMS Key Rotation: https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html
- AWS KMS Cryptography Essentials: https://docs.aws.amazon.com/kms/latest/developerguide/kms-cryptography.html

## Sensitive Data Classes

Encrypt at application level:

```text
connector_credentials
provider_api_keys
webhook_signing_secrets
refresh_tokens
high-risk raw payload classes where required
```

Do not encrypt only:

```text
display_name
source_type
provider
non-secret status fields
cost ledger
audit metadata
```

## Envelope Encryption Model

```text
data encrypted with Data Encryption Key (DEK)
DEK encrypted/wrapped by Key Encryption Key (KEK) in KMS
metadata stores key id/version/context
```

Required metadata:

```text
kms_key_id
kms_key_version nullable
encryption_context
algorithm
encrypted_dek
created_at
rotated_at
```

## Rotation

Key rotation has two concepts:

- rotating KMS key material / key version;
- re-encrypting existing application data.

Do not assume KMS automatic rotation re-encrypts all existing stored payloads in the application.

## Re-Encryption Jobs

For application-level encrypted data:

```text
re_encryption_job
  data_class
  tenant_id nullable
  old_kms_key_id
  new_kms_key_id
  status
  progress
  started_at
  completed_at
```

## Locked Decisions

1. Connector credentials use envelope encryption.
2. Encryption metadata is stored with encrypted payload refs.
3. Key rotation and data re-encryption are separate workflows.
4. Re-encryption jobs are auditable and resumable.
5. Secrets are never logged, exported or exposed to Flutter/mobile.

