import { spawnSync } from 'node:child_process';
import { statfsSync } from 'node:fs';

import { assertDockerEvidencePrerequisites } from './lib/docker-backend-evidence-harness.mjs';

const args = new Set(process.argv.slice(2));
const reportOnly = args.has('--report-only');
const skipPreflight = args.has('--skip-preflight');
const dockerTimeoutMs = positiveIntegerEnv('DOCKER_BACKEND_EVIDENCE_DOCKER_TIMEOUT_MS', 5_000);
const rows = readDockerSystemDf();
const hostFreeBytes = availableDiskBytes(process.cwd());
const danglingVolumeCount = countDockerLines(['volume', 'ls', '--filter', 'dangling=true', '--format', '{{.Name}}']);
const danglingImageCount = countDockerLines(['image', 'ls', '--filter', 'dangling=true', '--format', '{{.ID}}']);
const exitedContainerCount = countDockerLines(['ps', '-a', '--filter', 'status=exited', '--format', '{{.ID}}']);
const preflight = skipPreflight ? { ok: true, skipped: true } : runPreflight();

printReport({
  rows,
  hostFreeBytes,
  danglingVolumeCount,
  danglingImageCount,
  exitedContainerCount,
  preflight,
});

if (!preflight.ok && !reportOnly) {
  process.exit(1);
}

function runPreflight() {
  try {
    assertDockerEvidencePrerequisites();
    return { ok: true, skipped: false };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function readDockerSystemDf() {
  const result = runDocker(['system', 'df', '--format', '{{json .}}']);
  if (result.status !== 0) {
    throw new Error(commandFailureMessage(result, 'docker system df'));
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`docker system df returned non-JSON row: ${line}`);
      }
    });
}

function countDockerLines(args) {
  const result = runDocker(args);
  if (result.status !== 0) {
    return undefined;
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}

function printReport(report) {
  const rowByType = new Map(report.rows.map((row) => [String(row.Type ?? ''), row]));
  const imageRow = rowByType.get('Images');
  const containerRow = rowByType.get('Containers');
  const volumeRow = rowByType.get('Local Volumes');
  const buildCacheRow = rowByType.get('Build Cache');

  console.log([
    'Docker backend evidence storage report',
    `Host free at ${process.cwd()}: ${formatBytes(report.hostFreeBytes)}`,
    dockerRowLine('Images', imageRow),
    dockerRowLine('Containers', containerRow),
    dockerRowLine('Local Volumes', volumeRow),
    dockerRowLine('Build Cache', buildCacheRow),
    `Dangling volumes: ${formatOptionalCount(report.danglingVolumeCount)}`,
    `Dangling images: ${formatOptionalCount(report.danglingImageCount)}`,
    `Exited containers: ${formatOptionalCount(report.exitedContainerCount)}`,
    preflightLine(report.preflight),
    '',
    'No cleanup was performed.',
    'If preflight fails because Docker Desktop storage is full, review these commands manually:',
    '  docker container prune',
    '  docker volume prune',
    '  docker image prune',
    '  docker builder prune',
    'Run destructive cleanup only after confirming unrelated containers, volumes and images are safe to remove.',
  ].join('\n'));

  if (!report.preflight.ok && report.preflight.message !== undefined) {
    console.error(`\nPreflight failure detail:\n${report.preflight.message}`);
  }
}

function dockerRowLine(label, row) {
  if (row === undefined) {
    return `${label}: unavailable`;
  }

  return `${label}: total=${row.TotalCount ?? 'unknown'} active=${row.Active ?? 'unknown'} size=${row.Size ?? 'unknown'} reclaimable=${row.Reclaimable ?? 'unknown'}`;
}

function preflightLine(preflight) {
  if (preflight.skipped === true) {
    return 'Docker evidence preflight: skipped';
  }

  return `Docker evidence preflight: ${preflight.ok ? 'passed' : 'failed'}`;
}

function formatOptionalCount(count) {
  return count === undefined ? 'unavailable' : String(count);
}

function runDocker(args) {
  return spawnSync('docker', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: dockerTimeoutMs,
  });
}

function commandFailureMessage(result, label) {
  const stderr = result.stderr?.trim() ?? '';
  const stdout = result.stdout?.trim() ?? '';
  if (stderr.length > 0) {
    return `${label} failed: ${stderr}`;
  }
  if (stdout.length > 0) {
    return `${label} failed: ${stdout}`;
  }
  if (result.error !== undefined) {
    return `${label} failed: ${result.error.message}`;
  }
  return `${label} exited with status ${result.status ?? 'unknown'}`;
}

function availableDiskBytes(cwd) {
  const stats = statfsSync(cwd);
  return Number(stats.bavail) * Number(stats.bsize);
}

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
