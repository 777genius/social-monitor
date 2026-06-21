import { spawnSync } from 'node:child_process';
import { statfsSync } from 'node:fs';

import { assertDockerEvidencePrerequisites } from './lib/docker-backend-evidence-harness.mjs';

const args = new Set(process.argv.slice(2));
const reportOnly = args.has('--report-only');
const skipPreflight = args.has('--skip-preflight');
const inspectDangling = args.has('--inspect-dangling');
const dockerTimeoutMs = positiveIntegerEnv('DOCKER_BACKEND_EVIDENCE_DOCKER_TIMEOUT_MS', 15_000);
const danglingSampleLimit = positiveIntegerEnv('DOCKER_BACKEND_EVIDENCE_DANGLING_SAMPLE_LIMIT', 12);
const storageMode = process.env.DOCKER_BACKEND_EVIDENCE_STORAGE_MODE?.trim() || 'docker-volume';
const rows = readDockerSystemDf();
const hostFreeBytes = availableDiskBytes(process.cwd());
const danglingVolumeCount = countDockerLines(['volume', 'ls', '--filter', 'dangling=true', '--format', '{{.Name}}']);
const danglingImageCount = countDockerLines(['image', 'ls', '--filter', 'dangling=true', '--format', '{{.ID}}']);
const exitedContainerCount = countDockerLines(['ps', '-a', '--filter', 'status=exited', '--format', '{{.ID}}']);
const danglingInspection = inspectDangling ? inspectDockerDangling({ sampleLimit: danglingSampleLimit }) : undefined;
const preflight = skipPreflight ? { ok: true, skipped: true } : runPreflight();

printReport({
  rows,
  hostFreeBytes,
  storageMode,
  danglingVolumeCount,
  danglingImageCount,
  exitedContainerCount,
  danglingInspection,
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
    `Docker evidence storage mode: ${report.storageMode}`,
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

  printDanglingInspection(report.danglingInspection);

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

function inspectDockerDangling({ sampleLimit }) {
  const imageRows = listDockerLines([
    'image',
    'ls',
    '--filter',
    'dangling=true',
    '--format',
    '{{.ID}}\t{{.Size}}\t{{.CreatedSince}}',
  ]);
  const volumeRows = listDockerLines([
    'volume',
    'ls',
    '--filter',
    'dangling=true',
    '--format',
    '{{.Name}}',
  ]);

  return {
    sampleLimit,
    imageSamples: prioritizeDanglingRows({
      rows: imageRows,
      inspect: inspectDanglingImageMetadata,
    })?.slice(0, sampleLimit).map(inspectDanglingImage),
    volumeSamples: prioritizeDanglingRows({
      rows: volumeRows,
      inspect: inspectDanglingVolumeMetadata,
    })?.slice(0, sampleLimit).map(inspectDanglingVolume),
  };
}

function inspectDanglingImage(row) {
  const [id = 'unknown', size = 'unknown', createdSince = 'unknown'] = row.split('\t');
  const inspect = inspectDanglingImageMetadata(row);
  const history = runDocker(['history', '--no-trunc', '--format', '{{.CreatedBy}}', id]);
  const metadata = inspect.metadata;
  const historyText = history.status === 0 ? history.stdout.trim() : commandFailureMessage(history, `docker history ${id}`);
  const signals = danglingObjectSignals(`${row}\n${metadata}\n${historyText}`);

  return {
    id,
    size,
    createdSince,
    signals,
    metadata: metadata.split('\n').slice(0, 4),
  };
}

function inspectDanglingVolume(name) {
  const inspect = inspectDanglingVolumeMetadata(name);
  const metadata = inspect.metadata;
  const signals = danglingObjectSignals(`${name}\n${metadata}`);

  return {
    name,
    signals,
    metadata: metadata.split('\n').slice(0, 3),
  };
}

function inspectDanglingImageMetadata(row) {
  const [id = 'unknown'] = row.split('\t');
  const inspect = runDocker([
    'image',
    'inspect',
    id,
    '--format',
    'labels={{json .Config.Labels}}\nrepoTags={{json .RepoTags}}\ncreated={{.Created}}\nworkdir={{.Config.WorkingDir}}',
  ]);
  const metadata = inspect.status === 0 ? inspect.stdout.trim() : commandFailureMessage(inspect, `docker image inspect ${id}`);

  return {
    metadata,
    signals: danglingObjectSignals(`${row}\n${metadata}`),
  };
}

function inspectDanglingVolumeMetadata(name) {
  const inspect = runDocker([
    'volume',
    'inspect',
    name,
    '--format',
    'labels={{json .Labels}}\ncreated={{.CreatedAt}}\nmountpoint={{.Mountpoint}}',
  ]);
  const metadata = inspect.status === 0 ? inspect.stdout.trim() : commandFailureMessage(inspect, `docker volume inspect ${name}`);

  return {
    metadata,
    signals: danglingObjectSignals(`${name}\n${metadata}`),
  };
}

function prioritizeDanglingRows({ rows, inspect }) {
  if (rows === undefined) {
    return undefined;
  }

  return rows
    .map((row, index) => ({
      row,
      index,
      priority: danglingSignalPriority(inspect(row).signals),
    }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
    .map((candidate) => candidate.row);
}

function danglingSignalPriority(signals) {
  if (signals.includes('social-monitor marker')) {
    return 50;
  }
  if (signals.includes('backend evidence marker')) {
    return 40;
  }
  if (signals.includes('backend build layer marker')) {
    return 30;
  }
  if (signals.includes('node build layer marker')) {
    return 20;
  }
  if (signals.includes('compose project label')) {
    return 10;
  }

  return 0;
}

function danglingObjectSignals(text) {
  const lowerText = text.toLowerCase();
  const signals = [];
  if (lowerText.includes('social-monitor')) {
    signals.push('social-monitor marker');
  }
  if (lowerText.includes('backend-evidence') || lowerText.includes('staging-evidence')) {
    signals.push('backend evidence marker');
  }
  if (lowerText.includes('com.docker.compose.project')) {
    signals.push('compose project label');
  }
  if (lowerText.includes('npm ci') || lowerText.includes('package-lock.json')) {
    signals.push('node build layer marker');
  }
  if (lowerText.includes('tsc -p tsconfig.build.json') || lowerText.includes('prisma generate')) {
    signals.push('backend build layer marker');
  }

  return signals.length > 0 ? signals : ['no obvious project marker'];
}

function printDanglingInspection(inspection) {
  if (inspection === undefined) {
    return;
  }

  console.log(`\nDangling object inspection samples (first ${inspection.sampleLimit}; read-only):`);
  printDanglingImageSamples(inspection.imageSamples);
  printDanglingVolumeSamples(inspection.volumeSamples);
  console.log([
    '',
    'Manual follow-up commands:',
    '  docker image inspect <image-id>',
    '  docker history --no-trunc <image-id>',
    '  docker volume inspect <volume-name>',
    'Only remove objects after confirming ownership.',
  ].join('\n'));
}

function printDanglingImageSamples(samples) {
  if (samples === undefined) {
    console.log('Dangling image samples: unavailable');
    return;
  }
  if (samples.length === 0) {
    console.log('Dangling image samples: none');
    return;
  }

  console.log('Dangling image samples:');
  for (const sample of samples) {
    console.log(`- ${sample.id} size=${sample.size} age=${sample.createdSince} signals=${sample.signals.join(', ')}`);
    for (const line of sample.metadata) {
      console.log(`  ${line}`);
    }
  }
}

function printDanglingVolumeSamples(samples) {
  if (samples === undefined) {
    console.log('Dangling volume samples: unavailable');
    return;
  }
  if (samples.length === 0) {
    console.log('Dangling volume samples: none');
    return;
  }

  console.log('Dangling volume samples:');
  for (const sample of samples) {
    console.log(`- ${sample.name} signals=${sample.signals.join(', ')}`);
    for (const line of sample.metadata) {
      console.log(`  ${line}`);
    }
  }
}

function listDockerLines(args) {
  const result = runDocker(args);
  if (result.status !== 0) {
    return undefined;
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
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
