#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const protoRoot = join(projectRoot, 'libs/contracts/grpc');
const outputRoot = join(projectRoot, 'libs/contracts/generated/grpc');
const protoc = join(projectRoot, 'node_modules/.bin/grpc_tools_node_protoc');
const tsProtoPlugin = join(projectRoot, 'node_modules/.bin/protoc-gen-ts_proto');
const protoFiles = [
  join(protoRoot, 'x_collector/v1/x_collector.proto'),
];

const checkMode = process.argv.includes('--check');

for (const requiredPath of [protoc, tsProtoPlugin, ...protoFiles]) {
  assertExists(requiredPath);
}

if (checkMode) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'social-monitor-grpc-contracts-'));
  try {
    runGeneration(tempRoot);
    const diff = compareDirectories(outputRoot, tempRoot);
    if (diff.length > 0) {
      console.error('Generated gRPC contracts are stale. Run `npm run generate:grpc`.');
      for (const line of diff.slice(0, 20)) {
        console.error(`- ${line}`);
      }
      process.exit(1);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
} else {
  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });
  runGeneration(outputRoot);
}

function runGeneration(targetRoot) {
  mkdirSync(targetRoot, { recursive: true });

  const args = [
    `--plugin=protoc-gen-ts_proto=${tsProtoPlugin}`,
    `--ts_proto_out=${targetRoot}`,
    '--ts_proto_opt=outputServices=grpc-js',
    '--ts_proto_opt=esModuleInterop=true',
    '--ts_proto_opt=env=node',
    '--ts_proto_opt=forceLong=string',
    '--ts_proto_opt=useDate=true',
    '--ts_proto_opt=useExactTypes=false',
    `--proto_path=${protoRoot}`,
    ...protoFiles,
  ];

  const result = spawnSync(protoc, args, {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function assertExists(requiredPath) {
  if (!existsSync(requiredPath)) {
    console.error(`Missing required gRPC generation input: ${requiredPath}`);
    process.exit(1);
  }
}

function compareDirectories(expectedRoot, actualRoot, relativePath = '') {
  if (!existsSync(expectedRoot)) {
    return [`missing generated output directory ${expectedRoot}`];
  }

  const expectedEntries = entries(expectedRoot);
  const actualEntries = entries(actualRoot);
  const names = new Set([...expectedEntries.keys(), ...actualEntries.keys()]);
  const diff = [];

  for (const name of [...names].sort()) {
    const expected = expectedEntries.get(name);
    const actual = actualEntries.get(name);
    const childRelativePath = relativePath.length === 0 ? name : `${relativePath}/${name}`;

    if (expected === undefined) {
      diff.push(`unexpected generated file ${childRelativePath}`);
      continue;
    }
    if (actual === undefined) {
      diff.push(`missing generated file ${childRelativePath}`);
      continue;
    }
    if (expected.isDirectory !== actual.isDirectory) {
      diff.push(`generated path kind changed ${childRelativePath}`);
      continue;
    }
    if (expected.isDirectory) {
      diff.push(...compareDirectories(expected.path, actual.path, childRelativePath));
      continue;
    }

    const expectedContent = readFileSync(expected.path, 'utf8');
    const actualContent = readFileSync(actual.path, 'utf8');
    if (expectedContent !== actualContent) {
      diff.push(`changed generated file ${childRelativePath}`);
    }
  }

  return diff;
}

function entries(directory) {
  return new Map(
    readdirSync(directory, { withFileTypes: true }).map((entry) => [
      entry.name,
      {
        isDirectory: entry.isDirectory(),
        path: join(directory, entry.name),
      },
    ]),
  );
}
