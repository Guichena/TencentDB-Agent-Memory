import { describe, expect, it } from "vitest";

import { canonicalSha256 } from "../../eval/tool-prompt-bench/formal-runtime/canonical.js";
import {
  validatePairContractV2,
  type PairCaseProjectionV2,
  type PairContractV2,
} from "../../eval/tool-prompt-bench/measurement-v2/pair-contract.js";

describe("M1 pair contract compatibility with the R05 formal runtime", () => {
  it("accepts an M1 pair whose invariant is hashed through the R05 canonical seam", () => {
    const positiveCase: PairCaseProjectionV2 = {
      caseId: "compat-positive",
      split: "dev",
      comparisonDocument: {
        query: "Use the saved team formatter.",
        context: { language: "ts", team: "payments" },
        gold: { needTdaiTool: true },
      },
    };
    const negativeCase: PairCaseProjectionV2 = {
      caseId: "compat-negative",
      split: "dev",
      comparisonDocument: {
        query: "Use the formatter already shown above.",
        context: { language: "ts", team: "payments" },
        gold: { needTdaiTool: false },
      },
    };
    const invariantFieldsSha256 = canonicalSha256({
      invariantFields: {
        context: { language: "ts", team: "payments" },
        gold: { needTdaiTool: "__PAIR_ALLOWED_DELTA__" },
        query: "__PAIR_ALLOWED_DELTA__",
      },
      invariantProjectionSchemaVersion: "pair-invariant-projection-v2",
    });
    const contract: PairContractV2 = {
      schemaVersion: "2",
      pairId: "compat-pair-001",
      positiveCaseId: positiveCase.caseId,
      negativeCaseId: negativeCase.caseId,
      causalFactorId: "answer-source-saved-vs-present",
      allowedChangedPointers: ["/gold/needTdaiTool", "/query"],
      invariantProjectionSchemaVersion: "pair-invariant-projection-v2",
      invariantFieldsSha256,
      changedPointerCount: 2,
      minimalityReviewStatus: "approved",
      independenceKey: "compat-team-payments-formatter",
      split: "dev",
    };

    expect(validatePairContractV2(contract, positiveCase, negativeCase)).toEqual({
      ok: true,
      value: {
        contract,
        changedPointers: ["/gold/needTdaiTool", "/query"],
        computedInvariantFieldsSha256: invariantFieldsSha256,
      },
    });
  });
});
