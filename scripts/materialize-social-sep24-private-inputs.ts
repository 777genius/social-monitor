/** Operator-only input publication. No acquisition/import composition is reachable from this CLI. */
import { resolve } from 'node:path';
import { databaseSnapshotReader, type SnapshotReader } from './lib/social-source-private-input-database';
import { materializeSocialSep24PrivateInputs } from './lib/social-source-private-input-materializer';
import { PrivateInputRefusal, refuse } from './lib/social-source-private-input-contract';

export function parsePrivateInputCli(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== '--output-root' || !args[1] || !args[1].startsWith('/') || resolve(args[1]) !== args[1]) return refuse('arguments');
  return args[1];
}
export async function runPrivateInputCli(args: readonly string[], dependencies: {
  readSnapshots: SnapshotReader; worktree: string; writeReceipt: (value: string) => void;
}): Promise<void> {
  const outputRoot = parsePrivateInputCli(args);
  const result = await materializeSocialSep24PrivateInputs({ outputRoot, worktree: dependencies.worktree, readSnapshots: dependencies.readSnapshots });
  dependencies.writeReceipt(`${JSON.stringify(result.receipt)}\n`);
}
async function main(): Promise<void> {
  parsePrivateInputCli(process.argv.slice(2)); // Invalid CLI never reads even connection configuration.
  const databaseUrl = process.env.SOCIAL_SEP24_PRIVATE_INPUT_DATABASE_URL;
  if (!databaseUrl) return refuse('arguments');
  await runPrivateInputCli(process.argv.slice(2), { readSnapshots: databaseSnapshotReader(databaseUrl),
    worktree: resolve(__dirname, '..'), writeReceipt: (value) => { process.stdout.write(value); } });
}
if (require.main === module) {
  void main().catch((error: unknown) => {
    const category = error instanceof PrivateInputRefusal ? error.category : 'database';
    process.stderr.write(`private_input_refused:${category}\n`); process.exitCode = 1;
  });
}
