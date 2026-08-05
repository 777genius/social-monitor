import assert from "node:assert/strict";
import test from "node:test";

import {
  admitSubscriptionRuntimeWrapperRequest,
} from "./subscription-runtime-purpose-model-policy.mjs";

test("MJS policy removes both schema-name fields for output_text", () => {
  const admission = admitSubscriptionRuntimeWrapperRequest({
    provider: "codex",
    request: {
      context: { purpose: "social_monitor.reader_summary.weekly.generate" },
      task: {
        outputSchemaName: "weekly-summary",
        controls: {
          outputSchemaName: "weekly-summary",
          responseFormat: "text",
        },
        metadata: { runtimeOutput: "output_text" },
      },
    },
  });
  const task = admission.canonicalRequest.task;

  assert.equal(Object.hasOwn(task, "outputSchemaName"), false);
  assert.equal(Object.hasOwn(task.controls, "outputSchemaName"), false);
  assert.equal(task.controls.responseFormat, "text");
  assert.equal(task.metadata.runtimeOutput, "output_text");
});

test("MJS policy preserves structured schema names", () => {
  const admission = admitSubscriptionRuntimeWrapperRequest({
    provider: "codex",
    request: {
      context: { purpose: "social_monitor.reader_summary.generate" },
      task: {
        outputSchemaName: "daily-summary",
        controls: {
          outputSchemaName: "daily-summary",
          outputSchema: { type: "object" },
          responseFormat: "json",
        },
        metadata: { runtimeOutput: "structured_output" },
      },
    },
  });
  const task = admission.canonicalRequest.task;

  assert.equal(task.outputSchemaName, "daily-summary");
  assert.equal(task.controls.outputSchemaName, "daily-summary");
  assert.deepEqual(task.controls.outputSchema, { type: "object" });
  assert.equal(task.controls.responseFormat, "json");
  assert.equal(task.metadata.runtimeOutput, "structured_output");
});
