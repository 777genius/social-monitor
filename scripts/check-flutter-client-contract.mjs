import { accessSync, constants, existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dartClientPath = 'libs/contracts/rest/generated/flutter/social_monitor_api_client.dart';
const contractPath = 'libs/contracts/rest/generated/mobile-client.contract.json';
const violations = [];

if (!existsSync(contractPath)) {
  violations.push(`${contractPath} is missing. Run npm run check:mobile-client-contract -- --update`);
}

if (!existsSync(dartClientPath)) {
  violations.push(`${dartClientPath} is missing. Run npm run check:mobile-client-contract -- --update`);
}

const dartBin = resolveDartBin();
if (dartBin === null) {
  violations.push('Dart SDK is required for Flutter client compile checks. Set DART_BIN or install dart on PATH.');
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

const version = spawnSync(dartBin, ['--version'], {
  encoding: 'utf8',
});

if (version.status !== 0) {
  console.error(version.stderr || version.stdout);
  process.exit(version.status ?? 1);
}

const analyze = spawnSync(dartBin, ['analyze', dartClientPath], {
  stdio: 'inherit',
});

if (analyze.status !== 0) {
  process.exit(analyze.status ?? 1);
}

console.log('Flutter client contract compile check OK');

function resolveDartBin() {
  if (process.env.DART_BIN !== undefined && process.env.DART_BIN.trim().length > 0) {
    return executableOrNull(process.env.DART_BIN);
  }

  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, process.platform === 'win32' ? 'dart.exe' : 'dart');
    const executable = executableOrNull(candidate);

    if (executable !== null) {
      return executable;
    }
  }

  return null;
}

function executableOrNull(path) {
  try {
    accessSync(path, constants.X_OK);
    return path;
  } catch {
    return null;
  }
}
