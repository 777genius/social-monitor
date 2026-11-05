import assert from "node:assert/strict";
import test from "node:test";

import { finalStageCopiesFeedPromotionRecovery } from "./feed-promotion-migrate-dockerfile.mjs";

const recoveryCopy =
  "COPY scripts/check-feed-promotion-index-recovery.ts ./scripts/";

test("rejects a commented recovery COPY", () => {
  const dockerfile = `FROM node:22\n# ${recoveryCopy}\n`;

  assert.equal(finalStageCopiesFeedPromotionRecovery(dockerfile), false);
});

test("rejects a recovery COPY present only before the final stage", () => {
  const dockerfile = [
    "FROM node:22 AS build",
    recoveryCopy,
    "FROM node:22 AS runtime",
    "COPY package.json ./",
  ].join("\n");

  assert.equal(finalStageCopiesFeedPromotionRecovery(dockerfile), false);
});

test("accepts the exact active recovery COPY in the final stage", () => {
  const dockerfile = `FROM node:22\n\n  ${recoveryCopy}  \n`;

  assert.equal(finalStageCopiesFeedPromotionRecovery(dockerfile), true);
});
