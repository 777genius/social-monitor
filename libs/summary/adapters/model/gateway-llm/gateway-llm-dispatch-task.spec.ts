import type { GatewayLlmClientOptions } from "./gateway-llm-client-contract";
import type { GatewayLlmPrepared } from "./gateway-llm-task-preparation";
import { bindGatewayLlmDispatchTask } from "./gateway-llm-dispatch-task";

const frozenAt = new Date("2026-11-08T00:00:00.000Z");
const accountRefs = Object.freeze(["account-a", "account-b"]);
const prepared = {
  task: Object.freeze({ profileId: "gateway-test", model: "model-test",
    input: "trusted input", instructions: "trusted instructions",
    deadline: frozenAt, output: { mode: "text" } }),
  route: Object.freeze({ accountRefs }),
} as unknown as GatewayLlmPrepared;

describe("bindGatewayLlmDispatchTask", () => {
  it("binds exact identity with freshly ordered accounts without modifying frozen preparation", () => {
    const order = jest.fn(() => ["account-b", "account-a"]);
    const now = jest.fn(() => frozenAt);
    const options = { accounts: { order }, clock: { now } } as unknown as
      Pick<GatewayLlmClientOptions, "accounts" | "clock">;
    const identity = Object.freeze({ taskId: "task-a", attempt: 1 });

    const task = bindGatewayLlmDispatchTask(prepared, identity, options);
    expect(task).toEqual({
      ...prepared.task, taskId: "task-a", attempt: 1,
      accountRefs: ["account-b", "account-a"],
    });
    expect(order).toHaveBeenCalledTimes(1);
    expect(order).toHaveBeenCalledWith({ taskId: "task-a",
      accountRefs, now: frozenAt });
    expect(now).toHaveBeenCalledTimes(1);
    expect(prepared.route.accountRefs).toBe(accountRefs);
    expect(Object.isFrozen(prepared.task)).toBe(true);
    expect(identity).toEqual({ taskId: "task-a", attempt: 1 });
  });

  it("re-evaluates the selector for a safe retry without losing attempt identity", () => {
    const later = new Date("2026-11-08T00:00:01.000Z");
    const order = jest.fn()
      .mockReturnValueOnce(["account-a", "account-b"])
      .mockReturnValueOnce(["account-b", "account-a"]);
    const now = jest.fn().mockReturnValueOnce(frozenAt).mockReturnValueOnce(later);
    const options = { accounts: { order }, clock: { now } } as unknown as
      Pick<GatewayLlmClientOptions, "accounts" | "clock">;
    const first = bindGatewayLlmDispatchTask(prepared, { taskId: "task-b", attempt: 1 }, options);
    const second = bindGatewayLlmDispatchTask(prepared, { taskId: "task-b", attempt: 2 }, options);

    expect(first).toMatchObject({ taskId: "task-b", attempt: 1,
      accountRefs: ["account-a", "account-b"] });
    expect(second).toMatchObject({ taskId: "task-b", attempt: 2,
      accountRefs: ["account-b", "account-a"] });
    expect(order).toHaveBeenNthCalledWith(1, { taskId: "task-b",
      accountRefs, now: frozenAt });
    expect(order).toHaveBeenNthCalledWith(2, { taskId: "task-b",
      accountRefs, now: later });
    expect(now).toHaveBeenCalledTimes(2);
    expect(prepared.route.accountRefs).toBe(accountRefs);
  });
});
