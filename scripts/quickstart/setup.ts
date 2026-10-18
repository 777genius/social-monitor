import { materializeLocalConfiguration, readPublicDefaults, type AiConnection } from './local-config';
import { productionAgentRuntimeModel } from '../../apps/agent-runtime/src/subscription-runtime-purpose-model-policy';

async function main(): Promise<void> {
  const parts: Buffer[] = [];
  for await (const part of process.stdin) parts.push(Buffer.from(part));
  const input = Buffer.concat(parts).toString('utf8');
  const lines = input.split('\n');
  let connection: AiConnection | undefined;
  if (lines[0] !== undefined && lines[0].length > 0) {
    if (lines[0] !== 'codex' && lines[0] !== 'external') throw new Error('ai_mode_invalid');
    connection = {
      mode: lines[0], model: lines[1] || productionAgentRuntimeModel,
      address: lines[2] ?? '', serviceToken: lines[3] ?? '',
      scoringApiKey: lines[4] ?? '',
    };
    if (lines.slice(5).some((line) => line.length > 0)) throw new Error('setup_input_invalid');
  }
  const settings = await materializeLocalConfiguration({
    directory: process.argv[2] ?? '/state', defaults: await readPublicDefaults(),
    connection, now: new Date(),
  });
  console.log(`Configuration ready (${settings.connection.mode}).`);
}

void main().catch(() => {
  console.error('Configuration failed. Check private state-directory ownership and the AI connection settings. Existing settings were preserved.');
  process.exitCode = 1;
});
