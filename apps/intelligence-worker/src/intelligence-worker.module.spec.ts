import { Test } from "@nestjs/testing";

import { IntelligenceWorkerModule } from "./intelligence-worker.module";
import { ReaderSummaryJobPollingLoop } from "./reader-summary-job-polling-loop";

const controlledKeys = [
  "NODE_ENV",
  "READER_VALUE_MODE",
  "INTELLIGENCE_READER_SUMMARY_JOB_LOOP",
  "INTELLIGENCE_SUMMARY_QUEUE_READER",
  "AGENT_RUNTIME_GRPC_ADDRESS",
] as const;
const original = Object.fromEntries(
  controlledKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of controlledKeys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("IntelligenceWorkerModule", () => {
  it("starts with the default legacy_v2 mode and disabled reader-summary polling", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.READER_VALUE_MODE;
    delete process.env.INTELLIGENCE_READER_SUMMARY_JOB_LOOP;
    delete process.env.INTELLIGENCE_SUMMARY_QUEUE_READER;
    process.env.AGENT_RUNTIME_GRPC_ADDRESS = "127.0.0.1:1";

    const module = await Test.createTestingModule({
      imports: [IntelligenceWorkerModule],
    }).compile();

    await expect(module.init()).resolves.toBe(module);
    expect(module.get(ReaderSummaryJobPollingLoop)).toBeInstanceOf(
      ReaderSummaryJobPollingLoop,
    );
    await module.close();
  });
});
