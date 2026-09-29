import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

import { readOperatorArtifacts, redactedOperatorReceipt, verifyCurrentRelation } from "./import-hn-verified-remainder";
import { assertSep28AbsentCount, sep28BindingSha256, sep28ManifestSha256,
  verifiedHnJournalName } from "./recover-hn-verified-remainder";
import type { VerifiedHnImportScope } from "./recover-hn-verified-remainder";
import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

const sourceDir = resolve(__dirname, "../.artifacts/sep28-final-r1");
const pinTemplate = resolve(__dirname, "pins-hn-sep28.json");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const roots: string[] = [];

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function privateArtifact() {
  const root = await mkdtemp(join(tmpdir(), "hn-sep28-pinned-"));
  roots.push(root);
  const day = join(root, "sep28-final-r1");
  await mkdir(day, { mode: 0o700 });
  const pinsPath = join(root, "pins-hn-sep28.json");
  await writeFile(pinsPath, await readFile(pinTemplate), { mode: 0o600 });
  for (const name of ["manifest.json", "items.json"]) {
    await writeFile(join(day, name), await readFile(join(sourceDir, name)), { mode: 0o600 });
  }
  return { root, day, pinsPath, request: { inputRoot: root, pinsPath, campaign: "sep28" as const } };
}

describe("separate Sep28 public artifact admission", () => {
  // Red if an import receipt hides the source's incomplete coverage or leaks extra payload fields.
  it("labels the completed import receipt as partial source coverage", () => {
    expect(redactedOperatorReceipt({ planSha256: "0".repeat(64), inserted: 6, alreadyPresent: 5 }, "sep28"))
      .toEqual({ status: "COMPLETE", planSha256: "0".repeat(64), inserted: 6,
        alreadyPresent: 5, coverage: "PARTIAL_SOURCE_ONLY", sourceStatus: "incomplete" });
  });

  // Red if the Sep28 invocation can collide with or replay the terminal Sep20-27 journal.
  it("uses a distinct immutable campaign journal name", () => {
    expect(verifiedHnJournalName("sep28")).toBe("hn-verified-posts-2026-09-28.journal.json");
    expect(verifiedHnJournalName("sep28")).not.toBe(verifiedHnJournalName("remainder"));
  });

  // Red if a changed live snapshot silently broadens or shrinks the six-post write set.
  it("requires exactly six absent posts at the live recheck", () => {
    expect(() => assertSep28AbsentCount(11, 5)).not.toThrow();
    expect(() => assertSep28AbsentCount(11, 4)).toThrow("six-post import target");
    expect(() => assertSep28AbsentCount(11, 6)).toThrow("six-post import target");
    expect(() => assertSep28AbsentCount(12, 6)).toThrow("six-post import target");
  });

  // Red if this candidate points at a cross-day, repinned, or falsely complete artifact.
  it("pins the actual partial one-day artifact and its single complete story pass", async () => {
    const manifestBytes = await readFile(join(sourceDir, "manifest.json"));
    const itemsBytes = await readFile(join(sourceDir, "items.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as Record<string, unknown>;
    const items = JSON.parse(itemsBytes.toString("utf8")) as { day: string;
      candidateItems: { externalId: string; metadata: { source: string; searchQuery: string } }[] };
    const passes = manifest.passes as { status: string; mode: string; target: string;
      query: string; returnedIds: string[] }[];
    const complete = passes.filter((pass) => pass.status === "complete");
    expect(sha(manifestBytes)).toBe(sep28ManifestSha256);
    expect(sha(itemsBytes)).toBe(manifest.itemsSha256);
    expect(manifest).toMatchObject({ day: "2026-09-28", status: "incomplete",
      commentPassCoverage: "INCOMPLETE", configuredPasses: 28, attemptedPassWindows: 28,
      uniqueCandidateCount: 11, returnedItemCount: 11, bindingSha256: sep28BindingSha256 });
    expect(items.day).toBe("2026-09-28");
    expect(complete).toHaveLength(1);
    expect(complete[0]).toMatchObject({ mode: "search", target: "story" });
    expect(items.candidateItems).toHaveLength(11);
    expect(items.candidateItems.every((item) => complete[0]!.returnedIds.includes(item.externalId) &&
      item.metadata.source === "story_search" && item.metadata.searchQuery === complete[0]!.query)).toBe(true);
  });

  // Red if altered public bytes, a cross-day pin, or symlink path reach binding/SQL admission.
  it("rejects altered bytes, altered pins and symlinked source paths before binding read", async () => {
    const { root, day, pinsPath, request } = await privateArtifact();
    await expect(readOperatorArtifacts(request, process.getuid?.() ?? 0))
      .rejects.toMatchObject({ code: "ENOENT" }); // Only the independently supplied binding is absent.
    const originalItems = await readFile(join(day, "items.json"));
    await writeFile(join(day, "items.json"), Buffer.concat([originalItems, Buffer.from(" ")]));
    await expect(readOperatorArtifacts(request, process.getuid?.() ?? 0)).rejects.toThrow("SHA-256 mismatch");
    await writeFile(join(day, "items.json"), originalItems);
    const originalManifest = await readFile(join(day, "manifest.json"));
    await writeFile(join(day, "manifest.json"), Buffer.concat([originalManifest, Buffer.from(" ")]));
    await expect(readOperatorArtifacts(request, process.getuid?.() ?? 0)).rejects.toThrow("SHA-256 mismatch");
    await writeFile(join(day, "manifest.json"), originalManifest);
    const pins = JSON.parse(await readFile(pinsPath, "utf8")) as { days: { day: string }[] };
    pins.days[0]!.day = "2026-09-27";
    await writeFile(pinsPath, JSON.stringify(pins));
    await expect(readOperatorArtifacts(request, process.getuid?.() ?? 0)).rejects.toThrow("pins SHA-256 mismatch");
    await writeFile(pinsPath, await readFile(pinTemplate));
    await rm(join(day, "items.json"));
    await symlink(join(sourceDir, "items.json"), join(day, "items.json"));
    await expect(readOperatorArtifacts(request, process.getuid?.() ?? 0)).rejects.toThrow("root-owned and private");
    await chmod(root, 0o755);
    await expect(readOperatorArtifacts(request, process.getuid?.() ?? 0)).rejects.toThrow("private root-owned");
  });

  // Red if a matching tenant/query can pass after the HN binding config changes in place.
  it("requires the complete pinned binding config at the scoped HN relation", async () => {
    const scope: VerifiedHnImportScope = {
      tenantId: "00000000-0000-4000-8000-000000000001" as TenantId,
      workspaceId: "00000000-0000-4000-8000-000000000002" as WorkspaceId,
      interestId: "00000000-0000-4000-8000-000000000003",
      sourceBindingId: "00000000-0000-4000-8000-000000000004",
      scanPolicyId: "00000000-0000-4000-8000-000000000005", correlationId: "synthetic",
    };
    const calls: { sql: string; values?: readonly unknown[] }[] = [];
    const client = { query: async (sql: string, values?: readonly unknown[]) => {
      calls.push({ sql, values });
      return { rows: sql.includes("FROM pg_roles") ? [{ allowed: true }] : [] };
    }, release: () => undefined };
    const pool = { connect: async () => client } as unknown as Parameters<typeof verifyCurrentRelation>[0];
    await expect(verifyCurrentRelation(pool, scope, "synthetic", '{"mode":"search"}')).resolves.toBe(false);
    const relation = calls.find((call) => call.sql.includes("FROM tenants"));
    expect(relation?.sql).toContain("sb.config = $7::jsonb");
    expect(relation?.values).toEqual([scope.tenantId, scope.workspaceId, scope.interestId,
      scope.sourceBindingId, scope.scanPolicyId, "synthetic", '{"mode":"search"}']);
  });
});
