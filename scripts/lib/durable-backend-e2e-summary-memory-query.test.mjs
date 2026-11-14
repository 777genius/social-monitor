import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node").register({ transpileOnly: true, project: "tsconfig.build.json" });
require("tsconfig-paths/register");
const ts = require("typescript");
const { summaryMemoryContextQuery } = require("./durable-backend-e2e-summary-memory-query.ts");

const scope = { tenantId:"tenant-fixture", workspaceId:"workspace-fixture", userId:"user-fixture", interestId:"interest-fixture" };
const item = (fields={}) => ({ id:"feed-0", sourceBindingId:"binding-0", providerKey:"rss", ...fields });
const build = (feedItems) => summaryMemoryContextQuery({ ...scope, feedItems });

test("one call-time timestamp is shared by request, source window and missing observed dates", () => {
  const before=Date.now(), context=build([item()]), after=Date.now();
  assert.ok(context.requestedAt instanceof Date);
  assert.ok(context.requestedAt.getTime() >= before && context.requestedAt.getTime() <= after);
  assert.equal(context.tenantId, scope.tenantId);
  assert.equal(context.workspaceId, scope.workspaceId);
  assert.equal(context.interestId, scope.interestId);
  assert.equal(context.userId, scope.userId);
  assert.equal(context.evidence.sourceWindow.startedAt, context.requestedAt);
  assert.equal(context.evidence.sourceWindow.endedAt, context.requestedAt);
  assert.equal(context.evidence.items[0].observedAt, context.requestedAt);
  assert.equal(context.evidence.sourceWindow.windowId, "durable-backend-loop-memory-interest-fixture");
});

test("first twelve feed items alone are mapped in order with original index fallbacks", () => {
  const feedItems=Array.from({length:14},(_,i)=>item({ id:"feed-"+i, providerKey:i%2?"reddit":"rss" }));
  const snapshot=JSON.stringify(feedItems), context=build(feedItems);
  assert.equal(context.evidence.items.length,12);
  assert.deepEqual(context.evidence.sourceWindow.selectedFeedItemIds,
    Array.from({length:12},(_,i)=>"feed-"+i));
  assert.equal(context.evidence.items[0].sourceItemId,"source-rss-0");
  assert.equal(context.evidence.items[1].sourceItemId,"source-reddit-1");
  assert.equal(context.evidence.items[1].title,"reddit feed item 2");
  assert.equal(context.evidence.items[1].sourceBindingId,"binding-0");
  assert.equal(JSON.stringify(feedItems),snapshot);
});

test("optional strings preserve whitespace; absent/blank values remain omitted", () => {
  const context=build([item({sourceItemId:"  id  ",title:"  title  ",bodyPreview:"  body  ",
    canonicalUrl:" https://example.invalid/a ",observedAt:"2026-11-13T08:30:00Z"}),
    item({id:"feed-2",bodyPreview:"",canonicalUrl:"  "})]);
  const a=context.evidence.items[0],b=context.evidence.items[1];
  assert.equal(a.sourceItemId,"  id  ");
  assert.equal(a.title,"  title  ");
  assert.equal(a.bodyPreview,"  body  ");
  assert.equal(a.canonicalUrl," https://example.invalid/a ");
  assert.equal(a.observedAt.toISOString(),"2026-11-13T08:30:00.000Z");
  assert.equal(Object.hasOwn(b,"bodyPreview"),false);
  assert.equal(Object.hasOwn(b,"canonicalUrl"),false);
});

test("invalid/blank dates share fallback; missing required fields throw; items 13+ ignored", () => {
  const context=build([item({observedAt:"invalid"}),item({id:"feed-2",observedAt:" "})]);
  for(const evidence of context.evidence.items)assert.equal(evidence.observedAt,context.requestedAt);
  for(const field of ["id","providerKey","sourceBindingId"]){
    const broken=item();delete broken[field];
    assert.throws(()=>build([broken]),new RegExp("Expected "+field+" to be a non-empty string"));
  }
  assert.equal(build([...Array.from({length:12},(_,i)=>item({id:"feed-"+i})),{id:12}]).evidence.items.length,12);
});

// Parse the real TypeScript AST: comments and string literals cannot spoof delegation.
function runnerDelegatesContextQuery(source) {
  const tree = ts.createSourceFile("durable-backend-e2e-loop.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const queryImports = tree.statements.filter((node) =>
    ts.isImportDeclaration(node) &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    node.moduleSpecifier.text === "./lib/durable-backend-e2e-summary-memory-query" &&
    node.importClause?.namedBindings &&
    ts.isNamedImports(node.importClause.namedBindings) &&
    node.importClause.namedBindings.elements.some((part) =>
      part.name.text === "summaryMemoryContextQuery" && part.propertyName === undefined,
    ),
  );
  const pollFunctions = tree.statements.filter((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "pollSummaryMemoryEvidence",
  );
  const duplicateHelpers = tree.statements.some((node) =>
    ts.isFunctionDeclaration(node) &&
    ["summaryMemoryContextQuery", "parseDateOrFallback"].includes(node.name?.text),
  );
  let liveCalls = 0;
  if (pollFunctions.length === 1 && pollFunctions[0].body) {
    function visit(node) {
      if (ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "memory" &&
          node.expression.name.text === "buildContext" &&
          node.arguments.length === 1) {
        const query = node.arguments[0];
        if (ts.isCallExpression(query) &&
            ts.isIdentifier(query.expression) &&
            query.expression.text === "summaryMemoryContextQuery" &&
            query.arguments.length === 1 &&
            ts.isIdentifier(query.arguments[0]) &&
            query.arguments[0].text === "params") {
          liveCalls++;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(pollFunctions[0].body);
  }
  return queryImports.length === 1 && pollFunctions.length === 1 &&
    liveCalls === 1 && !duplicateHelpers;
}

test("runner delegates live polling to exactly one query owner (AST)", () => {
  const runner = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  assert.equal(runnerDelegatesContextQuery(runner), true);
  // A code-shaped comment or string must not hide removal of the real call.
  const noCall = runner.replace("memory.buildContext(summaryMemoryContextQuery(params))",
    "memory.buildContext(params)") +
    "\n// memory.buildContext(summaryMemoryContextQuery(params))";
  assert.notEqual(noCall, runner);
  assert.equal(runnerDelegatesContextQuery(noCall), false);
  const noImport = runner.replace(
    'import { summaryMemoryContextQuery } from "./lib/durable-backend-e2e-summary-memory-query";',
    '// import { summaryMemoryContextQuery } from "./lib/durable-backend-e2e-summary-memory-query";',
  );
  assert.notEqual(noImport, runner);
  assert.equal(runnerDelegatesContextQuery(noImport), false);
});
