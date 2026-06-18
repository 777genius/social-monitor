import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const contractPath = 'ops/release/backend-safe-verify-contract.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const scripts = contract.backendScripts ?? [];
const listOnly = process.argv.includes('--list');

if (listOnly) {
  console.log(scripts.join('\n'));
  process.exit(0);
}

for (const scriptName of scripts) {
  console.log(`\n> backend-safe ${scriptName}`);
  execFileSync('npm', ['run', scriptName], { stdio: 'inherit' });
}
