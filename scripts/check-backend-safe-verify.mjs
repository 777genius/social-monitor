import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const packagePath = 'package.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const releaseContract = JSON.parse(readFileSync(releaseContractPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const packageScripts = packageJson.scripts ?? {};
const backendScripts = new Set(contract.backendScripts ?? []);
const violations = [];

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.scope !== 'backend-only') {
  violations.push(`${contractPath}: scope must be backend-only`);
}

if (!existsSync(contract.runnerFile ?? '')) {
  violations.push(`${contractPath}: runnerFile must exist`);
}

if (!String(packageScripts[contract.runnerScript] ?? '').includes(contract.runnerFile)) {
  violations.push(`${packagePath}: ${contract.runnerScript} must run ${contract.runnerFile}`);
}

for (const scriptName of backendScripts) {
  if (!packageScripts[scriptName]) {
    violations.push(`${contractPath}: backendScripts references missing npm script "${scriptName}"`);
  }
}

for (const forbidden of contract.forbiddenScriptNames ?? []) {
  if (backendScripts.has(forbidden)) {
    violations.push(`${contractPath}: backend-safe verify must not run forbidden script "${forbidden}"`);
  }
}

for (const scriptName of backendScripts) {
  if (/agent|claude|mobile|flutter|live-open|live-reddit/i.test(scriptName)) {
    violations.push(`${contractPath}: backend-safe verify contains unsafe or out-of-scope script "${scriptName}"`);
  }
}

for (const gate of releaseContract.requiredGates ?? []) {
  const scriptName = String(gate.command ?? '').replace(/^npm run /, '');
  if (!backendScripts.has(scriptName)) {
    violations.push(`${contractPath}: backend-safe verify missing release gate script "${scriptName}"`);
  }
}

for (const requiredScript of ['build', 'test', 'test:e2e']) {
  if (!backendScripts.has(requiredScript)) {
    violations.push(`${contractPath}: backend-safe verify must include ${requiredScript}`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Backend-safe verify contract OK');
