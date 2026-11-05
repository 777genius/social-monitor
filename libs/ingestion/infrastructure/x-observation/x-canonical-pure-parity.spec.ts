import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { resolveXQueryBudget, resolveXQueryTarget } from "../../domain/x-observation/x-canonical-query-budget";
import { snapshotXReceiptPredicate } from "../../domain/x-observation/x-canonical-predicate";
import { xDays } from "../../domain/x-observation/x-canonical-days";
import { xCanonicalJson, xSemanticDigest } from "./x-canonical-digest";

// Immutable full reviewed blobs are test-only evidence, never a runtime dependency.
const pins = {
  selection: "fcd5d670991fdcad8c68f6a0767cc4861bc5136dc100f7df5bc24e25403361b7",
  predicate: "cd94710c8baafcfb3b90a815118674039f40af12b00341795a7eced8a86dfc6f",
  days: "469774ca51540bd161e3e36de3ca4791b041772da70eeff4ab783abdc8fe1409",
  digest: "3e891d7e32dbe1781776b77088ba4bc54bd17cff09f333dd4fdd516659ac2aba",
};
function declarations(source: string, names: readonly string[]): string {
  const file = ts.createSourceFile("oracle.ts", source, ts.ScriptTarget.ES2023, true);
  const selected = file.statements.filter((node) =>
    ts.isFunctionDeclaration(node) ? names.includes(node.name?.text ?? "") :
      ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => names.includes(d.name.getText(file))));
  expect(selected).toHaveLength(names.length);
  return selected.map((node) => node.getText(file)).join("\n");
}
function oracle<T>(key: keyof typeof pins, names: readonly string[], extractedPath: string): T {
  const bytes = readFileSync(`test/fixtures/x-canonical/${key}.ts.txt`);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(pins[key]);
  const original = declarations(bytes.toString(), names);
  // Exact declaration bytes include bodies, operator order, descriptor rules and error text.
  expect(declarations(readFileSync(extractedPath, "utf8"), names)).toBe(original);
  const emitted = ts.transpileModule(original, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2023 } }).outputText;
  const exports = {};
  // Only allowlisted pure declarations run, in the same realm so prototype semantics stay exact.
  new Function("exports", "createHash", emitted)(exports, createHash);
  return exports as T;
}
const domain = "libs/ingestion/domain/x-observation/";
const infrastructure = "libs/ingestion/infrastructure/x-observation/";
const outcome = (run: () => unknown) => {
  try { return { value: run() }; } catch (error) { return { error: (error as Error).message }; }
};

describe("exact reviewed b8ad pure helper extraction", () => {
  it("preserves budget/target arithmetic including explicit zero, missing values and numeric edges", () => {
    const original = oracle<{ resolveXQueryBudget: typeof resolveXQueryBudget; resolveXQueryTarget: typeof resolveXQueryTarget }>(
      "selection", ["resolveXQueryBudget", "resolveXQueryTarget"], domain + "x-canonical-query-budget.ts");
    const numbers = [-1, -0, 0, 1, 3, 10, 25, 100, 1.5, Number.MAX_SAFE_INTEGER, NaN, Infinity];
    for (const value of numbers) {
      const config = { maxItemsPerQuery: value, maxItemsBySearchQuery: new Map([["exact", value], ["zero", 0]]) };
      for (const query of ["exact", "zero", "EXACT", "", "missing"]) {
        expect(resolveXQueryBudget(config, query)).toBe(original.resolveXQueryBudget(config, query));
      }
      for (const count of numbers) for (const policy of [undefined, ...numbers.map((targetItems) => ({ targetItems }))]) {
        expect(resolveXQueryTarget(value, count, policy)).toBe(original.resolveXQueryTarget(value, count, policy));
      }
    }
  });
  it("preserves descriptor-safe rejection, immutable detachment, exact strings and error bytes", () => {
    const original = oracle<{ snapshotXReceiptPredicate: typeof snapshotXReceiptPredicate }>(
      "predicate", ["policyRecord", "snapshotXReceiptPredicate"], domain + "x-canonical-predicate.ts");
    const valid = { searchQuery: "  雪 exact  ", requireQueryMatch: true };
    const getter = jest.fn(() => "forbidden");
    const inputs: unknown[] = [valid, null, undefined, [], Object.create(null), new Date(0),
      { ...valid, extra: 1 }, { ...valid, searchQuery: " " }, { ...valid, requireQueryMatch: 1 },
      Object.defineProperty({ ...valid }, "minLikes", { get: getter, enumerable: true }),
      Object.defineProperty({ ...valid }, "hidden", { value: 1 }),
      { ...valid, [Symbol("extra")]: 1 }, Object.create(valid),
      Object.defineProperty({ ...valid }, "__proto__", { value: {}, enumerable: true })];
    for (const key of ["minLikes", "minReposts", "minReplies"]) for (const value of
      [undefined, null, -0, -1, 0, 1, 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "0"]) {
      inputs.push({ ...valid, [key]: value });
    }
    for (const input of inputs) {
      expect(outcome(() => snapshotXReceiptPredicate(input))).toEqual(outcome(() => original.snapshotXReceiptPredicate(input)));
    }
    expect(getter).not.toHaveBeenCalled();
    const result = snapshotXReceiptPredicate(valid);
    valid.searchQuery = "mutated";
    expect(result.searchQuery).toBe("  雪 exact  ");
    expect(Object.isFrozen(result)).toBe(true);
  });
  it("preserves seven day coordinates and exact canonical JSON/digest semantics, including legacy edges", () => {
    const originalDays = oracle<{ xDays: typeof xDays }>("days", ["xDays"], domain + "x-canonical-days.ts");
    expect(xDays).toEqual(originalDays.xDays);
    const original = oracle<{ xCanonicalJson: typeof xCanonicalJson; xSemanticDigest: typeof xSemanticDigest }>(
      "digest", ["xCanonicalJson", "xSemanticDigest"], infrastructure + "x-canonical-digest.ts");
    const getter = jest.fn(() => 3);
    const cases = [null, true, false, "雪\ud800", 0, -0, Number.MAX_SAFE_INTEGER, 1.5, NaN, Infinity, undefined,
      { "\uffff": 1, "😀": 2, z: [false, null, "雪"], a: "\\\"\n" }, [], new Array(2), [undefined],
      Object.create(null), new Date(0), { [Symbol("hidden")]: 1 }, { value: undefined },
      Object.defineProperty({}, "hidden", { value: 1 }), Object.defineProperty({}, "read", { get: getter, enumerable: true })];
    for (const input of cases) {
      expect(outcome(() => xCanonicalJson(input))).toEqual(outcome(() => original.xCanonicalJson(input)));
      expect(outcome(() => xSemanticDigest(input))).toEqual(outcome(() => original.xSemanticDigest(input)));
    }
    // Canonical JSON intentionally retains reviewed getter behavior; snapshot validation is a separate boundary.
    expect(getter).toHaveBeenCalledTimes(4);
  });
});
