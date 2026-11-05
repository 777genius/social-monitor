import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

import { readOperatorArtifacts, redactedOperatorReceipt, verifyCurrentRelation } from "./import-hn-verified-remainder";
import { assertSep28AbsentCount, sep28BindingSha256, sep28ManifestSha256,
  verifiedHnJournalName } from "./recover-hn-verified-remainder";
import type { VerifiedHnImportScope } from "./recover-hn-verified-remainder";
import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

const pinTemplate = resolve(__dirname, "pins-hn-sep28.json");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const roots: string[] = [];

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function privateArtifact() {
  const root = await mkdtemp(join(tmpdir(), "hn-sep28-pinned-"));
  roots.push(root);
  const pinsPath = join(root, "pins-hn-sep28.json");
  await writeFile(pinsPath, await readFile(pinTemplate), { mode: 0o600 });
  return { root, pinsPath, request: { inputRoot: root, pinsPath, campaign: "sep28" as const } };
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

  // Red if the checked-in pin silently changes campaign day, binding or manifest identity.
  it("pins one Sep28 partial-source artifact without requiring private payloads in Git", async () => {
    const pinsBytes = await readFile(pinTemplate);
    const pins = JSON.parse(pinsBytes.toString("utf8")) as Record<string, unknown>;
    expect(sha(pinsBytes)).toBe("25b3e45b2ead5fb6ecae9a4dcaa39ba6a51be6cb084dae419fd13a8de50ec871");
    expect(pins).toEqual({ schemaVersion: 1, bindingSha256: sep28BindingSha256,
      days: [{ day: "2026-09-28", directory: "sep28-final-r1",
        manifestSha256: sep28ManifestSha256 }] });
  });

  // Red if a missing private payload, altered pin or unsafe path reaches binding/SQL admission.
  it("refuses missing private input, altered pins and symlinked source paths", async () => {
    const { root, pinsPath, request } = await privateArtifact();
    await expect(readOperatorArtifacts(request, process.getuid?.() ?? 0))
      .rejects.toMatchObject({ code: "ENOENT" }); // The private manifest is intentionally absent.
    const pins = JSON.parse(await readFile(pinsPath, "utf8")) as { days: { day: string }[] };
    pins.days[0]!.day = "2026-09-27";
    await writeFile(pinsPath, JSON.stringify(pins));
    await expect(readOperatorArtifacts(request, process.getuid?.() ?? 0)).rejects.toThrow("pins SHA-256 mismatch");
    await writeFile(pinsPath, await readFile(pinTemplate));
    const link = `${root}-symlink`;
    roots.push(link);
    await symlink(root, link);
    await expect(readOperatorArtifacts({ inputRoot: link, pinsPath: join(link, "pins-hn-sep28.json"),
      campaign: "sep28" }, process.getuid?.() ?? 0)).rejects.toThrow("private root-owned");
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
