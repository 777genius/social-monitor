import type { AgentRuntimeSettings } from "./agent-runtime-settings";

const mockInspect = jest.fn();
const mockResolveSettings = jest.fn();
const mockAddService = jest.fn();
let mockBindCallback: ((error: Error | null) => void) | undefined;
const mockBind = jest.fn((_address: string, _credentials: unknown,
  callback: (error: Error | null) => void) => { mockBindCallback = callback; });

jest.mock("@grpc/grpc-js", () => ({
  Server: jest.fn().mockImplementation(() => ({
    addService: mockAddService, bindAsync: mockBind,
    tryShutdown: jest.fn(), forceShutdown: jest.fn(),
  })),
  ServerCredentials: { createInsecure: jest.fn(() => ({})) },
}));
jest.mock("./agent-runtime-settings", () => ({
  resolveAgentRuntimeSettings: (...args: unknown[]) => mockResolveSettings(...args),
}));
jest.mock("./subscription-runtime-installation", () => ({
  FileSubscriptionRuntimeInstallationInspector: jest.fn().mockImplementation(() => ({ inspect: mockInspect })),
}));
jest.mock("./subscription-runtime-cli-executor", () => ({ SubscriptionRuntimeCliExecutor: jest.fn() }));
jest.mock("./agent-runtime-grpc-service", () => ({ createAgentRuntimeGrpcService: jest.fn(() => ({})) }));
jest.mock("@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime", () => ({ AgentRuntimeServiceService: {} }));

const settings = (): AgentRuntimeSettings => ({
  bindAddress: "127.0.0.1:50052",
  strictAdmission: {
    workspaceRoot: "/TEST/summary-workspace",
    allowedModelBackends: ["xiaomi-mimo-token-plan"],
    allowedScope: { tenantId: "TEST-tenant", workspaceId: "TEST-workspace" },
  },
  cli: { command: "/TEST/runtime-wrapper.mjs", ephemeral: false,
    model: "mimo-v2.6-pro", reasoningEffort: "high" },
});
const finishBind = (error: Error | null): void => {
  expect(mockBindCallback).toBeDefined();
  if (mockBindCallback === undefined) throw new Error("TEST bind callback missing");
  mockBindCallback(error);
};

describe("real agent runtime application readiness", () => {
  const signals = ["SIGINT", "SIGTERM"] as const;
  const originalListeners = new Map<string, ReturnType<typeof process.listeners>>();
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockBindCallback = undefined;
    mockInspect.mockResolvedValue(undefined);
    mockResolveSettings.mockReturnValue(settings());
    for (const signal of signals) originalListeners.set(signal, process.listeners(signal));
  });
  afterEach(() => {
    for (const signal of signals) {
      const prior = originalListeners.get(signal) ?? [];
      for (const listener of process.listeners(signal)) {
        if (!prior.includes(listener)) process.removeListener(signal, listener);
      }
    }
  });

  it("exports the exact strict proof only after installation admission and the real bind callback", async () => {
    let admit: (() => void) | undefined;
    mockInspect.mockReturnValue(new Promise<void>(resolve => { admit = resolve; }));
    const main = await import("./main");
    expect(main.applicationReady).toBeInstanceOf(Promise);
    expect(mockBind).not.toHaveBeenCalled();
    expect(mockInspect).toHaveBeenCalledWith("/TEST/runtime-wrapper.mjs", "xiaomi-mimo-token-plan");
    if (admit === undefined) throw new Error("TEST admission callback missing");
    admit();
    await Promise.resolve();
    let completed = false;
    void main.applicationReady.then(() => { completed = true; });
    expect(mockBind).toHaveBeenCalledWith("127.0.0.1:50052", {}, expect.any(Function));
    expect(completed).toBe(false);
    finishBind(null);
    await expect(main.applicationReady).resolves.toEqual({
      contract: "social-monitor.agent-runtime.startup.v1",
      endpoint: "127.0.0.1:50052", admission: "strict-mimo-token",
    });
  });
  it("rejects an installation refusal without binding or advertising readiness", async () => {
    const refusal = new Error("TEST installation refusal");
    mockInspect.mockRejectedValue(refusal);
    const main = await import("./main");
    await expect(main.applicationReady).rejects.toBe(refusal);
    expect(mockBind).not.toHaveBeenCalled();
  });
  it("rejects a real bind error without a ready proof", async () => {
    const main = await import("./main");
    const refused = new Error("TEST endpoint unavailable");
    finishBind(refused);
    await expect(main.applicationReady).rejects.toBe(refused);
  });
  it("never labels the ordinary runtime as strict MiMo admission", async () => {
    mockResolveSettings.mockReturnValue({ ...settings(), strictAdmission: undefined });
    const main = await import("./main");
    finishBind(null);
    await expect(main.applicationReady).resolves.toMatchObject({ admission: "ordinary" });
    expect(mockInspect).not.toHaveBeenCalled();
  });
  it("preserves the dual-backend service without claiming MiMo-only admission", async () => {
    const value = settings();
    mockResolveSettings.mockReturnValue({ ...value, strictAdmission: {
      ...value.strictAdmission!, allowedModelBackends: ["openai-chatgpt", "xiaomi-mimo-token-plan"],
    } });
    const main = await import("./main");
    finishBind(null);
    await expect(main.applicationReady).resolves.toMatchObject({ admission: "ordinary" });
    expect(mockInspect).toHaveBeenCalledWith("/TEST/runtime-wrapper.mjs", undefined);
  });
  it("retains a configuration refusal as a rejected exported Promise", async () => {
    const refusal = new Error("TEST invalid configuration");
    mockResolveSettings.mockImplementationOnce(() => { throw refusal; });
    const main = await import("./main");
    await expect(main.applicationReady).rejects.toBe(refusal);
    expect(mockInspect).not.toHaveBeenCalled();
    expect(mockBind).not.toHaveBeenCalled();
  });
});
