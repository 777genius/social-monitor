import { parseDotenv } from "./env-file";

describe("env-file", () => {
  it("parses quoted and unquoted dotenv values without overriding policy", () => {
    expect(
      parseDotenv(
        Buffer.from(
          [
            "DATABASE_URL=postgresql://user:pass@127.0.0.1:54329/social_monitor",
            "AGENT_RUNTIME_GRPC_ADDRESS='127.0.0.1:50052'",
            'X_COLLECTOR_GRPC_ADDRESS="127.0.0.1:50051"',
            "POSTGRES_PORT=54329 # local docker postgres",
            "# COMMENTED=value",
          ].join("\n"),
        ),
      ),
    ).toEqual({
      DATABASE_URL:
        "postgresql://user:pass@127.0.0.1:54329/social_monitor",
      AGENT_RUNTIME_GRPC_ADDRESS: "127.0.0.1:50052",
      X_COLLECTOR_GRPC_ADDRESS: "127.0.0.1:50051",
      POSTGRES_PORT: "54329",
    });
  });
});
