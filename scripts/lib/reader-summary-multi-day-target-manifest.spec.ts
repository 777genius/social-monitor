import {
  validateTargetManifestV2,
  validateTargetManifestV3,
  type TargetManifestV3,
} from "./reader-summary-multi-day-target-manifest";
import { dailyPeriodKey } from "./reader-summary-quality-eval-support";
import { parseCaptureTargetManifestOptions } from "../capture-reader-summary-multi-day-quality-target-manifest";

describe("reader summary multi-day target manifest v3", () => {
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
    const manifest = targetManifestV3();

    expect(validateTargetManifestV3(manifest, dates())).toEqual(manifest);
  });

  it("rejects extra keys at every trust boundary", () => {
    const manifest = targetManifestV3();
    expect(() =>
      validateTargetManifestV3({ ...manifest, surprise: true }, dates()),
    ).toThrow("unsupported v3 contract");
    expect(() =>
      validateTargetManifestV3(
        { ...manifest, scope: { ...manifest.scope, surprise: true } },
        dates(),
      ),
    ).toThrow("unsupported v3 contract");
    expect(() =>
      validateTargetManifestV3(
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
    const manifest = targetManifestV3();
    expect(() =>
      validateTargetManifestV3(
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
      validateTargetManifestV3(
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

  it("rejects missing proof hashes and a noncanonical workspace scope key", () => {
    const manifest = targetManifestV3();
    const missingHash = structuredClone(manifest) as unknown as {
      targets: Array<Record<string, unknown>>;
    };
    delete missingHash.targets[0]!.exactProofSha256;
    expect(() => validateTargetManifestV3(missingHash, dates())).toThrow(
      "invalid target binding",
    );
    expect(() =>
      validateTargetManifestV3(
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
      validateTargetManifestV3(
        {
          ...manifest,
          scope: {
            ...manifest.scope,
            scopeKey: `workspace:${manifest.scope.workspaceId}`,
          },
        },
        dates(),
      ),
    ).toThrow("unsupported v3 contract");
  });

  it("keeps v2 readable only through its explicit validator", () => {
    const v3 = targetManifestV3();
    const v2 = {
      schemaVersion: 2,
      artifactFormat: "reader-summary-multi-day-quality-target-manifest-v2",
      generationProfile: v3.generationProfile,
      scope: {
        ...v3.scope,
        scopeKey: `workspace:${v3.scope.workspaceId}`,
      },
      targets: v3.targets.map((target) => ({
        collectionDate: target.collectionDate,
        artifactId: target.artifactId,
        periodKey: target.periodKey,
        artifactPayloadSha256: target.artifactPayloadSha256,
        actualDayProjectionSha256: target.actualDayProjectionSha256,
      })),
    };

    expect(validateTargetManifestV2(v2, dates())).toEqual(v2);
    expect(() => validateTargetManifestV3(v2, dates())).toThrow(
      "unsupported v3 contract",
    );
  });
});

function targetManifestV3(): TargetManifestV3 {
  const tenantId = "00000000-0000-7000-8000-000000000001";
  const workspaceId = "00000000-0000-7000-8000-000000000002";
  return {
    schemaVersion: 3,
    artifactFormat: "reader-summary-multi-day-quality-target-manifest-v3",
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
