import {
  validateTargetManifestV2,
  validateTargetManifestV3,
  validateTargetManifestV4,
  type TargetManifestV3,
  type TargetManifestV4,
} from "./reader-summary-multi-day-target-manifest";
import { dailyPeriodKey } from "./reader-summary-quality-eval-support";
import { parseCaptureTargetManifestOptions } from "../capture-reader-summary-multi-day-quality-target-manifest";

describe("reader summary multi-day target manifest v4", () => {
  it("derives the canonical scope key instead of accepting operator input", () => {
    const args = dates().flatMap((date) => ["--date", date]);
    const parsed = parseCaptureTargetManifestOptions([
      ...args,
      "--tenant-id",
      "00000000-0000-7000-8000-000000000001",
      "--workspace-id",
      "00000000-0000-7000-8000-000000000002",
      "--out",
      "/private/tmp/target.json",
    ]);
    expect(parsed.scopeKey).toBe("workspace");
    expect(() =>
      parseCaptureTargetManifestOptions([
        ...args,
        "--tenant-id",
        "00000000-0000-7000-8000-000000000001",
        "--workspace-id",
        "00000000-0000-7000-8000-000000000002",
        "--scope-key",
        "workspace",
        "--out",
        "/private/tmp/target.json",
      ]),
    ).toThrow("Invalid capture argument");
  });

  it("accepts an exact sorted five-day current-publication manifest", () => {
    const manifest = targetManifestV4();

    expect(validateTargetManifestV4(manifest, dates())).toEqual(manifest);
  });

  it("requires a captured-current database identity and exact capture time", () => {
    const manifest = targetManifestV4();
    expect(() =>
      validateTargetManifestV4(
        { ...manifest, databaseFingerprint: "postgres-sha256:not-a-hash" },
        dates(),
      ),
    ).toThrow("unsupported v4 contract");
    expect(() =>
      validateTargetManifestV4(
        { ...manifest, capturedAt: "2026-07-21" },
        dates(),
      ),
    ).toThrow("unsupported v4 contract");
    expect(() =>
      validateTargetManifestV4(
        { ...manifest, currentAtCapture: false },
        dates(),
      ),
    ).toThrow("unsupported v4 contract");
  });

  it("requires at least five reviewed dates", () => {
    const manifest = targetManifestV4();
    const fourDates = dates().slice(0, 4);
    expect(() =>
      validateTargetManifestV4(
        { ...manifest, targets: manifest.targets.slice(0, 4) },
        fourDates,
      ),
    ).toThrow("unsupported v4 contract");
  });

  it("requires every reviewed date to be distinct", () => {
    const manifest = targetManifestV4();
    expect(() =>
      validateTargetManifestV4(
        {
          ...manifest,
          targets: manifest.targets.map((target, index) =>
            index === 1
              ? {
                  ...target,
                  collectionDate: manifest.targets[0]!.collectionDate,
                  periodKey: manifest.targets[0]!.periodKey,
                }
              : target,
          ),
        },
        dates(),
      ),
    ).toThrow("duplicate collection dates");
  });

  it("rejects extra keys at every trust boundary", () => {
    const manifest = targetManifestV4();
    expect(() =>
      validateTargetManifestV4({ ...manifest, surprise: true }, dates()),
    ).toThrow("unsupported v4 contract");
    expect(() =>
      validateTargetManifestV4(
        { ...manifest, scope: { ...manifest.scope, surprise: true } },
        dates(),
      ),
    ).toThrow("unsupported v4 contract");
    expect(() =>
      validateTargetManifestV4(
        {
          ...manifest,
          targets: [
            { ...manifest.targets[0], surprise: true },
            ...manifest.targets.slice(1),
          ],
        },
        dates(),
      ),
    ).toThrow("invalid target binding");
  });

  it("rejects unsorted dates and duplicate publication identities", () => {
    const manifest = targetManifestV4();
    expect(() =>
      validateTargetManifestV4(
        {
          ...manifest,
          targets: [
            manifest.targets[1]!,
            manifest.targets[0]!,
            ...manifest.targets.slice(2),
          ],
        },
        dates(),
      ),
    ).toThrow("strictly sorted ascending");

    expect(() =>
      validateTargetManifestV4(
        {
          ...manifest,
          targets: manifest.targets.map((target) => ({
            ...target,
            publicationId: manifest.targets[0]!.publicationId,
          })),
        },
        dates(),
      ),
    ).toThrow("duplicate publication ids");
  });

  it("rejects duplicate artifact identities in otherwise fresh v4 bindings", () => {
    const manifest = targetManifestV4();
    expect(() =>
      validateTargetManifestV4(
        {
          ...manifest,
          targets: manifest.targets.map((target, index) =>
            index === 1
              ? { ...target, artifactId: manifest.targets[0]!.artifactId }
              : target,
          ),
        },
        dates(),
      ),
    ).toThrow("duplicate artifact ids");
  });

  it("rejects missing proof hashes and a noncanonical workspace scope key", () => {
    const manifest = targetManifestV4();
    const missingHash = structuredClone(manifest) as unknown as {
      targets: Array<Record<string, unknown>>;
    };
    delete missingHash.targets[0]!.exactProofSha256;
    expect(() => validateTargetManifestV4(missingHash, dates())).toThrow(
      "invalid target binding",
    );
    expect(() =>
      validateTargetManifestV4(
        {
          ...manifest,
          targets: manifest.targets.map((target, index) =>
            index === 0
              ? { ...target, exactProofSha256: "f".repeat(64) }
              : target,
          ),
        },
        dates(),
      ),
    ).toThrow("invalid target binding");
    expect(() =>
      validateTargetManifestV4(
        {
          ...manifest,
          scope: {
            ...manifest.scope,
            scopeKey: `workspace:${manifest.scope.workspaceId}`,
          },
        },
        dates(),
      ),
    ).toThrow("unsupported v4 contract");
  });

  it("keeps v2 readable only through its explicit validator", () => {
    const v4 = targetManifestV4();
    const v2 = {
      schemaVersion: 2,
      artifactFormat: "reader-summary-multi-day-quality-target-manifest-v2",
      generationProfile: v4.generationProfile,
      scope: {
        ...v4.scope,
        scopeKey: `workspace:${v4.scope.workspaceId}`,
      },
      targets: v4.targets.map((target) => ({
        collectionDate: target.collectionDate,
        artifactId: target.artifactId,
        periodKey: target.periodKey,
        artifactPayloadSha256: target.artifactPayloadSha256,
        actualDayProjectionSha256: target.actualDayProjectionSha256,
      })),
    };

    expect(validateTargetManifestV2(v2, dates())).toEqual(v2);
    expect(() => validateTargetManifestV4(v2, dates())).toThrow(
      "unsupported v4 contract",
    );
  });

  it("keeps the immutable v3 shape readable only through its legacy validator", () => {
    const v4 = targetManifestV4();
    const v3: TargetManifestV3 = {
      schemaVersion: 3,
      artifactFormat: "reader-summary-multi-day-quality-target-manifest-v3",
      generationProfile: v4.generationProfile,
      scope: v4.scope,
      targets: v4.targets,
    };

    expect(validateTargetManifestV3(v3, dates())).toEqual(v3);
    expect(() => validateTargetManifestV4(v3, dates())).toThrow(
      "unsupported v4 contract",
    );
  });
});

function targetManifestV4(): TargetManifestV4 {
  const tenantId = "00000000-0000-7000-8000-000000000001";
  const workspaceId = "00000000-0000-7000-8000-000000000002";
  return {
    schemaVersion: 4,
    artifactFormat: "reader-summary-multi-day-quality-target-manifest-v4",
    databaseFingerprint: `postgres-sha256:${"f".repeat(64)}`,
    capturedAt: "2026-07-21T00:10:00.000Z",
    currentAtCapture: true,
    generationProfile: {
      modelVersion: "codex:gpt-5.5:xhigh",
      promptVersion: "reader_summary.prompt.agent_runtime.v10",
      rankingPolicyVersion: "story_ranking_v8",
    },
    scope: {
      tenantId,
      workspaceId,
      scopeType: "workspace",
      scopeKey: "workspace",
    },
    targets: dates().map((collectionDate, index) => ({
      collectionDate,
      periodKey: dailyPeriodKey(collectionDate),
      publicationId: uuid(index + 10),
      artifactId: uuid(index + 20),
      reportSha256: "a".repeat(64),
      proofSha256: "b".repeat(64),
      exactProofSha256: "b".repeat(64),
      artifactPayloadSha256: "d".repeat(64),
      actualDayProjectionSha256: "e".repeat(64),
    })),
  };
}

function dates(): readonly string[] {
  return [
    "2026-07-16",
    "2026-07-17",
    "2026-07-18",
    "2026-07-19",
    "2026-07-20",
  ];
}

function uuid(value: number): string {
  return `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
}
