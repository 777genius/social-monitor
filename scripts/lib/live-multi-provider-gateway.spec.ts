import fs = require("node:fs");

const settings = {
  LIVE_MULTI_PROVIDER_SUMMARY_MODEL: "agent-runtime",
  LIVE_MULTI_PROVIDER_READER_SUMMARY_MODEL: "agent-runtime",
  RELEVANCE_CONTENT_QUALITY_REVIEWER: "agent-runtime",
  AGENT_RUNTIME_TRANSPORT: "gateway-llm",
  AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
  AGENT_RUNTIME_GATEWAY_LLM_CONTROL_ORIGIN: "https://gateway.example.test",
  AGENT_RUNTIME_GATEWAY_LLM_CONTROL_TOKEN_FILE: "/synthetic/live-gateway-token",
  AGENT_RUNTIME_GATEWAY_LLM_ACCOUNT_REFS: "synthetic-live-account",
  AGENT_RUNTIME_GATEWAY_LLM_POLICY_SUBJECT_REF: "synthetic-social-monitor",
  AGENT_RUNTIME_GATEWAY_LLM_POLICY_REVISION: "1",
  AGENT_RUNTIME_GATEWAY_LLM_BINDING_REVISION: "0",
};
const keys = [...Object.keys(settings), "LIVE_MULTI_PROVIDER_AGENT_RUNTIME_MODEL",
  "LIVE_MULTI_PROVIDER_AGENT_RUNTIME_READER_MODEL"];

describe("live multi-provider gateway composition", () => {
  const original = new Map(keys.map(key => [key, process.env[key]]));
  beforeEach(() => Object.assign(process.env, settings));
  afterEach(() => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  it("constructs all model paths without opening the old CLI or OpenAI credential path", () => {
    const read = fs.readFileSync;
    jest.spyOn(fs, "readFileSync").mockImplementation(((path, options) =>
      path === settings.AGENT_RUNTIME_GATEWAY_LLM_CONTROL_TOKEN_FILE
        ? "synthetic-control-token" : read(path, options)) as typeof fs.readFileSync);
    jest.isolateModules(() => {
      const { GrpcAgentRuntimeClient } = require("../../libs/summary/adapters/model/grpc-agent-runtime-client");
      const grpc = jest.spyOn(GrpcAgentRuntimeClient, "connect").mockImplementation(() => {
        throw new Error("Unexpected legacy runtime connection");
      });
      const { buildSummaryModel, buildReaderSummaryModel, buildSourceContentQualityReviewer } =
        require("./live-multi-provider-summary-models");
      expect(() => buildSummaryModel()).not.toThrow();
      expect(() => buildReaderSummaryModel()).not.toThrow();
      const assessment = buildSourceContentQualityReviewer();
      expect(assessment.constructor.name).toBe("AgentRuntimeSourceContentQualityReviewerAdapter");
      expect(grpc).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["LIVE_MULTI_PROVIDER_AGENT_RUNTIME_MODEL", "buildSummaryModel"],
    ["LIVE_MULTI_PROVIDER_AGENT_RUNTIME_READER_MODEL", "buildReaderSummaryModel"],
  ])("rejects a purpose override that disagrees with the gateway: %s", (setting, factory) => {
    process.env[setting] = "gpt-5.6-sol";
    const read = fs.readFileSync;
    jest.spyOn(fs, "readFileSync").mockImplementation(((path, options) =>
      path === settings.AGENT_RUNTIME_GATEWAY_LLM_CONTROL_TOKEN_FILE
        ? "synthetic-control-token" : read(path, options)) as typeof fs.readFileSync);
    jest.isolateModules(() => {
      const models = require("./live-multi-provider-summary-models");
      expect(() => models[factory]()).toThrow(/model|purpose/iu);
    });
  });
});
