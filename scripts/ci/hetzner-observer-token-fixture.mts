// Offline synthetic SSH peer: receives a complete pipe, never contacts a host.
import assert from 'node:assert/strict';
const args = process.argv.slice(2);
assert.equal(args.at(-1), 'observer-token');
assert.equal(args.includes('StrictHostKeyChecking=yes'), true);
assert.equal(args.includes('IdentitiesOnly=yes'), true);
assert.equal(args.includes('IdentityAgent=none'), true);
assert.equal(args.includes('sm-release'), true);
assert.equal(process.env.GH_TOKEN, undefined);
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
const token = Buffer.concat(chunks);
assert.equal(token.toString(), 'TEST_ONLY_OPAQUE_JOB_TOKEN_000000');
assert.equal(args.some(arg => arg.includes(token.toString())), false);
// Host stderr can contain private data; the real transport must discard it.
process.stderr.write(token);
process.stdout.write('{"observer_token":"configured"}\n');
