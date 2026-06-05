# 188. File and Media Ingestion Safety

## Status

Locked for media/security baseline.

## Research Anchors

- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP Unrestricted File Upload: https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload

## Decision

Treat all uploaded or source-fetched media as untrusted. Store in object storage, validate metadata, and process asynchronously in isolated workers.

## Rules

- Allowlist file types by feature.
- Validate extension, declared MIME and detected content type.
- Generate server-side object names; do not trust uploaded filenames.
- Store untrusted media outside public executable paths.
- Use quarantine state before making media available.
- Strip or isolate risky metadata where needed.
- Scan for malware when accepting user-uploaded files or risky source media.
- Enforce file size, dimensions and decompression limits.

## Source Media

For social source media:

- prefer storing references/metadata first;
- fetch binary media only when product value justifies cost/risk;
- keep retention shorter than normalized metadata;
- never render active content directly.

## Best-Fact Choice

Media ingestion creates a larger attack surface than text ingestion. Keep it optional, isolated and asynchronous until the product needs it.

