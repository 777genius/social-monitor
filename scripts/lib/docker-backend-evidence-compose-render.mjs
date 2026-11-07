import { join } from "node:path";

export function hostBindStorageServiceSections(hostStorageRoot) {
  if (hostStorageRoot === undefined) {
    return [];
  }

  return [
    serviceVolumes("postgres", [
      [join(hostStorageRoot, "postgres"), "/var/lib/postgresql"],
    ]),
    serviceVolumes("redis", [[join(hostStorageRoot, "redis"), "/data"]]),
    serviceVolumes("rabbitmq", [
      [join(hostStorageRoot, "rabbitmq"), "/var/lib/rabbitmq"],
    ]),
  ];
}

function serviceVolumes(service, entries) {
  return [
    `  ${service}:`,
    "    volumes:",
    ...entries.flatMap(([source, target]) => [
      "      - type: bind",
      `        source: ${JSON.stringify(source)}`,
      `        target: ${JSON.stringify(target)}`,
    ]),
  ].join("\n");
}

export function serviceEnvironment(service, entries) {
  const normalizedEntries = entries.filter(
    ([, value]) => typeof value === "string" && value.trim().length > 0,
  );

  return [
    `  ${service}:`,
    "    environment:",
    ...normalizedEntries.map(
      ([name, value]) => `      ${name}: ${JSON.stringify(value)}`,
    ),
  ].join("\n");
}
