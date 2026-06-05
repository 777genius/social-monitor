# 156. Field-Level Encryption

## Status

Locked for security/data baseline.

## Research Anchors

- OWASP Cryptographic Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- OWASP Key Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html
- NIST SP 800-57 Part 1 Rev. 5: https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final

## Decision

Use application-level field encryption for high-value secrets and sensitive credential material. Database/disk encryption is required but not sufficient.

## Encrypt at Field Level

Encrypt:

- source OAuth access tokens;
- source OAuth refresh tokens;
- webhook signing secrets;
- external integration secrets;
- tenant-owned API key secret material before hashing/tokenization where needed;
- future private source credentials.

Usually do not field-encrypt:

- normal topic names;
- normalized public post text;
- feed item metadata;
- aggregate metrics.

Use data classification to decide, not a blanket rule.

## Key Hierarchy

Baseline:

```text
KMS root/master key
-> tenant or credential data-encryption key
-> encrypted field payload
```

Store encrypted fields with:

- algorithm;
- key id/version;
- nonce/iv;
- ciphertext;
- authentication tag;
- created/rotated timestamps.

## Search Boundary

Encrypted fields are not searchable unless using a deliberate tokenization/blind-index design. Do not compromise credential secrecy to make operational search convenient.

## Best-Fact Choice

Field-level encryption is reserved for material that remains dangerous after database compromise. Over-encrypting all product data makes search, support and deletion harder without proportional benefit.

