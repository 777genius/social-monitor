import { execFileSync } from "node:child_process";

import { prismaDateColumns } from "./reader-summary-weekly-projection-postgres-contract";

describe("reader summary weekly projection PostgreSQL test adapter dates", () => {
  it("normalizes node-postgres DATE local midnight from Europe/Kiev", () => {
    const output = execFileSync(process.execPath, [
      "-r", require.resolve("ts-node/register"),
      "-r", require.resolve("tsconfig-paths/register"),
      "-e", [
        'const { prismaDateColumns } = require("./scripts/lib/reader-summary-weekly-projection-postgres-contract");',
        "const localMidnight = new Date(2026, 5, 1);",
        "const result = prismaDateColumns({ weekStartedOn: localMidnight });",
        "process.stdout.write(JSON.stringify([localMidnight.toISOString(), result.weekStartedOn.toISOString()]));",
      ].join(""),
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        TZ: "Europe/Kiev",
        TS_NODE_TRANSPILE_ONLY: "true",
        TS_NODE_COMPILER_OPTIONS: '{"rootDir":"."}',
      },
    });

    expect(JSON.parse(output)).toEqual([
      "2026-05-31T21:00:00.000Z",
      "2026-06-01T00:00:00.000Z",
    ]);
  });

  it("preserves strict date strings and ignores invalid Dates", () => {
    const invalid = new Date(Number.NaN);
    const result = prismaDateColumns({
      requestedUtcDate: "2026-06-02",
      weekStartedOn: invalid,
      weekEndedOn: "2026-6-7",
    });

    expect(result.requestedUtcDate).toEqual(new Date("2026-06-02T00:00:00.000Z"));
    expect(result.weekStartedOn).toBe(invalid);
    expect(result.weekEndedOn).toBe("2026-6-7");
  });
});
