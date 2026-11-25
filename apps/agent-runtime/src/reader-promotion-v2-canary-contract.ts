import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

type ReaderPromotionV2CanaryContract = {
  readonly readerPromotionV2CanaryPurpose: string;
  readonly readerPromotionV2CanarySchemaName: string;
  readonly readerPromotionV2CanarySchemaVersion: string;
  readonly readerPromotionV2CanaryOutputSchema: Readonly<
    Record<string, unknown>
  >;
  readonly readerPromotionV2CanarySchemaEquals: (value: unknown) => boolean;
  readonly readerPromotionV2CanaryOutputIsValid: (value: unknown) => boolean;
};

const sourceContractPath = join(
  __dirname,
  "../bin/reader-promotion-v2-canary-contract.cjs",
);
const builtContractPath = join(
  __dirname,
  "../../../../apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs",
);

const runtimeRequire = createRequire(__filename);
const contract = runtimeRequire(
  existsSync(sourceContractPath) ? sourceContractPath : builtContractPath,
) as ReaderPromotionV2CanaryContract;

export const {
  readerPromotionV2CanaryOutputIsValid,
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanarySchemaEquals,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
} = contract;
