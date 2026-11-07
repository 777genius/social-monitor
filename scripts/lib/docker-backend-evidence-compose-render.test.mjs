import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { hostBindStorageServiceSections, serviceEnvironment } from "./docker-backend-evidence-compose-render.mjs";

test("bind volumes are absent when host storage was not selected", () => {
  assert.deepEqual(hostBindStorageServiceSections(undefined), []);
});

test("host storage retains three service sections, paths and ordering", () => {
  const sections = hostBindStorageServiceSections("/tmp/a space");
  assert.equal(sections.length, 3);
  assert.deepEqual(sections.map((section) => section.split("\n")[0]), [
    "  postgres:", "  redis:", "  rabbitmq:",
  ]);
  assert.ok(sections[0].includes(`source: ${JSON.stringify(join("/tmp/a space", "postgres"))}`));
  assert.ok(sections[1].includes('target: "/data"'));
  assert.ok(sections[2].includes('target: "/var/lib/rabbitmq"'));
});

test("environment filters only blank or non-string values and quotes JSON", () => {
  const value = serviceEnvironment("api", [
    ["A", "0"], ["EMPTY", "  "], ["N", 7], ["QUOTE", 'line\n"quoted"'], ["LAST", "yes"],
  ]);
  assert.equal(value, [
    "  api:",
    "    environment:",
    '      A: "0"',
    '      QUOTE: "line\\n\\"quoted\\""',
    '      LAST: "yes"',
  ].join("\n"));
});
