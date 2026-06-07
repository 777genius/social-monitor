import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const catalogPath = 'libs/contracts/events/event-catalog.json';
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const violations = [];
const eventTypePattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+(?:\.v[0-9]+)?$/;
const producerFiles = globSync('libs/**/*.ts').filter(
  (file) =>
    !file.endsWith('.spec.ts') &&
    !file.includes('/contracts/') &&
    !file.includes('/interfaces/rest/') &&
    !file.includes('/domain/entities/'),
);

if (catalog.schemaVersion !== 1) {
  violations.push(`${catalogPath}: schemaVersion must be 1`);
}

if (!Array.isArray(catalog.events) || catalog.events.length === 0) {
  violations.push(`${catalogPath}: events must be a non-empty array`);
}

const catalogKeys = new Set();

for (const event of catalog.events ?? []) {
  if (!eventTypePattern.test(event.eventType ?? '')) {
    violations.push(`${catalogPath}: invalid eventType "${event.eventType}"`);
  }

  if (!Number.isInteger(event.schemaVersion) || event.schemaVersion < 1) {
    violations.push(`${catalogPath}: ${event.eventType} must use positive integer schemaVersion`);
  }

  if (typeof event.producer !== 'string' || event.producer.trim().length === 0) {
    violations.push(`${catalogPath}: ${event.eventType} must declare producer`);
  }

  if (!Array.isArray(event.requiredPayloadFields) || event.requiredPayloadFields.length === 0) {
    violations.push(`${catalogPath}: ${event.eventType} must declare requiredPayloadFields`);
  }

  const duplicatePayloadFields = duplicates(event.requiredPayloadFields ?? []);
  if (duplicatePayloadFields.length > 0) {
    violations.push(`${catalogPath}: ${event.eventType} duplicates payload fields: ${duplicatePayloadFields.join(', ')}`);
  }

  const key = `${event.eventType}@${event.schemaVersion}`;
  if (catalogKeys.has(key)) {
    violations.push(`${catalogPath}: duplicate event contract ${key}`);
  }
  catalogKeys.add(key);
}

for (const file of producerFiles) {
  const source = readFileSync(file, 'utf8');
  const eventMatches = [...source.matchAll(/eventType:\s*['"]([^'"]+)['"]/g)];

  for (const match of eventMatches) {
    const eventType = match[1];
    if (!eventTypePattern.test(eventType)) {
      continue;
    }

    const afterEventType = source.slice(match.index ?? 0, (match.index ?? 0) + 600);
    const versionMatch = afterEventType.match(/schemaVersion:\s*([0-9]+)/);
    const version = versionMatch?.[1] ?? eventType.match(/\.v([0-9]+)$/)?.[1];
    if (!version) {
      violations.push(`${file}: event "${eventType}" must declare schemaVersion near eventType`);
      continue;
    }

    const key = `${eventType}@${version}`;
    if (!catalogKeys.has(key)) {
      violations.push(`${file}: produced event "${key}" is missing from ${catalogPath}`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Event contracts OK');

function duplicates(values) {
  const seen = new Set();
  const duplicateValues = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicateValues.add(value);
    }
    seen.add(value);
  }

  return [...duplicateValues];
}
