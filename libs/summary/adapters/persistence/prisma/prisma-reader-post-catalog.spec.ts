import { randomUUID } from "node:crypto";
import { captureNativeText } from "@social-monitor/ingestion/domain/value-objects/source-content-capture";
import { readReaderValueCapture } from "@social-monitor/relevance/infrastructure/reader-value/reader-value-capture";
import { ConservativeReaderValueInputBuilder } from "@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder";
import { SourceContentSafetyPolicy } from "@social-monitor/relevance/domain/source-content-safety";
import type { ReaderValueScoringProvider } from "@social-monitor/relevance/infrastructure/reader-value/reader-value-provider-config";
import { ReaderPostCurrentAssessmentIdentityAdapter } from "@social-monitor/relevance/infrastructure/reader-value/reader-post-current-assessment-identity.adapter";
import { catalogFixture } from "../../../../../test/support/reader-post-catalog";

const createFixture = (provider: ReaderValueScoringProvider = "openrouter-systemone") => {
  const builder = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy(), provider);
  return catalogFixture({ builder, identity: new ReaderPostCurrentAssessmentIdentityAdapter(builder, provider), capture: readReaderValueCapture });
};

describe("All posts current assessment identity over real SQL", () => {
  let fixture: Awaited<ReturnType<typeof catalogFixture>>;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await fixture.db.close(); });

  it("returns the complete 2000-candidate window without truncating it", async () => {
    await fixture.insertPosts(2000);
    const prepare = jest.spyOn(fixture.identity, "prepare").mockReturnValue(undefined);
    const posts = await fixture.reader.read(fixture.window);
    expect(posts).toHaveLength(2000);
    expect(new Set(posts.map(post => post.sourceItemId)).size).toBe(2000);
    expect(prepare).toHaveBeenCalledTimes(2000);
  });
  it("rejects 2001 candidates before preparing input or joining assessments", async () => {
    await fixture.insertPosts(2001);
    const prepare = jest.spyOn(fixture.identity, "prepare");
    await expect(fixture.reader.read(fixture.window)).rejects.toMatchObject({
      code: "operation.conflict", message: "Post window is too large; choose a shorter period",
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(fixture.statements).toHaveLength(1);
    expect(fixture.statements[0]).not.toContain("reader_value_assessments");
  });

  it("keeps an unassessed quote visible and discloses missing context without inventing labels", async () => {
    await fixture.insertPost();
    expect(await fixture.reader.read(fixture.window)).toEqual([expect.objectContaining({
      engagement: 104, usefulness: null, relevance: null, quotedContext: "not_captured",
    })]);
  });
  it("shows labels only from the exact rebuilt current source and scoring configuration", async () => {
    const post = await fixture.insertPost();
    await fixture.insertAssessment(post.input);
    expect(await fixture.reader.read(fixture.window)).toEqual([expect.objectContaining({
      id: post.id, usefulness: "useful", relevance: "central", quotedContext: "not_captured",
    })]);
  });
  it("uses the active provider configuration without borrowing scores from the default provider", async () => {
    await fixture.db.close();
    fixture = await createFixture("openai-decisions");
    const post = await fixture.insertPost();
    const previous = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy()).prepare(post.source, "revision");
    if (!previous.ok) throw new Error("Synthetic input refused");
    await fixture.insertAssessment(previous.value);
    expect((await fixture.reader.read(fixture.window))[0]).toMatchObject({ usefulness: null, relevance: null });
    await fixture.insertAssessment(post.input);
    expect((await fixture.reader.read(fixture.window))[0]).toMatchObject({ usefulness: "useful", relevance: "central" });
  });
  it.each(["quote-context", "rubric", "model", "pending-current", "failed-current", "input-hash", "request-hash"])(
    "does not borrow an older assessed row after %s changes", async (kind) => {
      const post = await fixture.insertPost();
      let old = { ...post.input };
      if (kind === "quote-context") {
        const prepared = fixture.builder.prepare({ ...post.source, quotedContext: undefined }, "revision");
        if (!prepared.ok) throw new Error("Synthetic input refused");
        old = prepared.value;
      } else if (kind === "input-hash") old.inputSha256 = "0".repeat(64);
      else if (kind === "request-hash") old.requestSha256 = "0".repeat(64);
      else if (kind === "model") old.modelConfigVersion = "old-model-configuration";
      else old.rubricSha256 = "a".repeat(64);
      await fixture.insertAssessment(old);
      if (kind === "pending-current" || kind === "failed-current") {
        await fixture.insertAssessment(post.input, kind === "pending-current" ? "pending" : "permanent_failed");
      }
      expect((await fixture.reader.read(fixture.window))[0]).toMatchObject({ usefulness: null, relevance: null });
    });
  it("rejects changed capture metadata even when title, body and content revision stay identical", async () => {
    const post = await fixture.insertPost({ kind: "x_post" }, false);
    await fixture.insertAssessment(post.input);
    const captured = captureNativeText({ ...post.source, metadata: { kind: "x_post" } }, "x-twitter", new Date("2026-10-31T11:00:00Z"));
    await fixture.db.query("UPDATE source_items SET metadata=$1 WHERE id=$2", [JSON.stringify(captured.metadata), post.input.sourceItemId]);
    const capture = readReaderValueCapture(captured.metadata!, "x-twitter", captured.title, captured.body,
      { sourceItemId: post.input.sourceItemId, canonicalUrl: post.source.canonicalUrl });
    const prepared = fixture.builder.prepare({ ...post.source, ...capture }, "revision");
    if (!prepared.ok) throw new Error("Synthetic input refused");
    expect(prepared.value.sourceSnapshotSha256).not.toBe(post.input.sourceSnapshotSha256);
    expect((await fixture.reader.read(fixture.window))[0]).toMatchObject({ usefulness: null, relevance: null });
    await fixture.insertAssessment(prepared.value);
    expect((await fixture.reader.read(fixture.window))[0]).toMatchObject({ usefulness: "useful", relevance: "central" });
  });
  it("chooses a valid current interest projection over a stale score for the same source", async () => {
    const post = await fixture.insertPost();
    await fixture.insertAssessment({ ...post.input, rubricSha256: "a".repeat(64) });
    const interest = randomUUID(), id = randomUUID(), binding = randomUUID();
    await fixture.db.query("INSERT INTO interests VALUES($1,$2,$3,'Current robot topic','ENABLED',NULL)",
      [interest, post.input.tenantId, post.input.workspaceId]);
    await fixture.db.query("INSERT INTO source_bindings SELECT $1,tenant_id,workspace_id,$2,source_catalog_entry_id,'ENABLED',NULL FROM source_bindings LIMIT 1", [binding, interest]);
    await fixture.db.query("INSERT INTO feed_items SELECT $1,tenant_id,workspace_id,source_item_id,provider_key,$2,$3,published_at,provider_metadata,status FROM feed_items LIMIT 1", [id, interest, binding]);
    const prepared = fixture.builder.prepare({ ...post.source, interestId: interest, interest: "Current robot topic" }, "revision");
    if (!prepared.ok) throw new Error("Synthetic input refused");
    await fixture.insertAssessment(prepared.value);
    const posts = await fixture.reader.read(fixture.window);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ id, usefulness: "useful", relevance: "central" });
  });
  it("keeps source/interest/tenant scope and performs no assessment writes", async () => {
    const post = await fixture.insertPost();
    await fixture.insertAssessment(post.input);
    const count = await fixture.db.query<{ count: number }>("SELECT count(*)::int AS count FROM reader_value_assessments");
    await fixture.db.query("UPDATE interests SET query='Different raw interest'");
    expect((await fixture.reader.read(fixture.window))[0]).toMatchObject({ usefulness: null, relevance: null });
    expect(await fixture.reader.read({ ...fixture.window, tenantId: post.input.sourceItemId as typeof fixture.window.tenantId })).toEqual([]);
    expect(await fixture.db.query("SELECT count(*)::int AS count FROM reader_value_assessments")).toEqual(count);
  });
});
