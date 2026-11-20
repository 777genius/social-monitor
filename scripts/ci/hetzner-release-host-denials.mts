import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Finite host denial codes that the release client may copy into public receipts.
// The host returns a constant reason such as {"denied":"disk-space"}; anything outside this set is
// reported only as the generic cohort-host-denied, which hides the first failed admission check.
// The list lives beside the host code (ops/release/hetzner/host_denial_codes.json), where a test keeps it
// complete; never add free-form text.
const CODE = /^[a-z][a-z0-9-]{0,127}$/u;
const parsed: unknown = JSON.parse(readFileSync(resolve('ops/release/hetzner/host_denial_codes.json'), 'utf8'));
if (!Array.isArray(parsed) || !parsed.every((code): code is string => typeof code === 'string' && CODE.test(code)))
  throw new Error('host-denial-codes-invalid');
export const HOST_DENIAL_CODES: readonly string[] = parsed;
