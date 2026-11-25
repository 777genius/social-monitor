import { createHash } from "node:crypto";

/** The gateway accepts at most this many account preferences per task. */
export const gatewayLlmMaxAccountRefs = 16;

/** Pure, stable account preference admission; cooldowns are applied by the selector. */
export const rotateGatewayLlmAccountRefs = (input: {
  readonly taskId: string;
  readonly accountRefs: readonly string[];
}): readonly string[] => {
  const refs = [...new Set(input.accountRefs)];
  if (refs.length === 0 || refs.length > gatewayLlmMaxAccountRefs) {
    throw new Error("Gateway llm route requires 1..16 distinct accounts");
  }
  const offset = stableOffset(input.taskId, refs.length);
  const rotated = [...refs.slice(offset), ...refs.slice(0, offset)];
  return rotated;
};

const stableOffset = (taskId: string, size: number): number =>
  createHash("sha256").update(taskId, "utf8").digest().readUInt32BE(0) % size;
