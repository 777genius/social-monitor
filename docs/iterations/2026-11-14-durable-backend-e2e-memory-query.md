# Durable backend E2E query projection — 2026-11-14

Frozen base: `419fb0821e3b57bf94c0df03eab461930ab532f7`; original runner blob `7b6a51e73c469048c37c39725109901657fbdd96`.
Original `summaryMemoryContextQuery`: lines 1176–1225, 48 nonblank lines, of which six parameter/type-signature lines are excluded. Original exclusive `parseDateOrFallback`: lines 1604–1610, seven nonblank lines. **49 unique nonblank original implementation candidate LOC** (42 + 7), preliminary; not types, blank lines, imports, tests, formatting, docs or net deletions. Other accepted owners #759 (52), #760 (53), and merged-pending-postmerge #762 (60) do not overlap.

## Three critical review rounds

1. **Responsibility**: one new query-projection module owns the bounded MemoStack evidence payload, with exclusive date fallback. Existing orchestration owns polling, transport, timeout, response interpretation and persistence. Zero new dependencies or abstractions.
2. **Behavior/security**: original two function bodies are identical apart from the query `export` keyword. Preserve single call-time `new Date()`, first 12 items, index-based IDs/titles, optional fields, required-field failures, date fallback identity, tenant/workspace branding and request window. Do not log credentials or modify public/security contracts.
3. **Testing and acceptance**: scoped regression tests cover ordering, truncation, mutation, optional fields, date behavior, failures and original live delegation. Existing architecture gate gains one test, physical runner cap ratchets `1621 → 1561`. No deployment, SSH, force push, CI bypass, or concurrent writer. Draft jobs do not equal full E2E. Qualification requires exact-head Ready native 20/20, security/review, SHA-guarded merge and postmerge native 20/20 plus nonpublishing API image.
